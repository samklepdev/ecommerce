# ARCHITECTURE — orientation note

Read this first for a fast mental model, then `CLAUDE.md` for the non-negotiable rules and
`PROJECT_STRUCTURE.md` for the full directory layout. This note is the "where things are and
what state they're in" map.

## What this is

A Next.js (App Router) storefront on Clean Architecture / DDD. Payment is a single method:
**non-custodial on-chain Bitcoin** — each order gets a unique receive address derived from a
watch-only xpub, and a chain-watcher poller confirms settlement. No processor, no custody, no
card rails. The slice compiles clean and runs end to end (checkout → address+QR → watcher →
status), with a few pieces intentionally stubbed (see "State" below).

## Mental model (how to think about the code)

Three ideas explain the whole layout:

1. **Dependency rule points inward.** `domain` → knows nothing. `application` → use cases +
   ports (interfaces). `infrastructure` → adapters implementing those ports. `app/` →
   presentation, thin, calls use cases only. An import from infrastructure into domain is a
   bug, not a style choice.

2. **Bounded contexts** live under `src/modules/*` (`catalog`, `cart`, `inventory`, `checkout`,
   `orders`, `payments`, `identity`), each with its own `domain` / `application` /
   `infrastructure`. Shared kernel is `src/shared`.

3. **One payment abstraction.** Everything goes through the `PaymentGateway` port. The BTC
   adapter is the only implementation today; the port stays a port so a second method could be
   added without touching anything downstream. On-chain state is normalized into a
   `PaymentEvent` that the domain consumes — the domain never touches bitcoin libraries.

## The one flow that matters (BTC checkout)

```
POST /api/checkout
  → StartCheckout: reprice (server-side) → reserve inventory → gateway.createPayment
      → allocate atomic address index (Redis INCR)
      → derive unique bc1q… address from xpub
      → lock fiat→BTC quote, persist a watchable intent (Postgres)
      → return { address, amountBtc, bip21 (QR), expiresAt, statusUrl }
  → BitcoinCheckout.tsx renders address + amount + QR, polls statusUrl

worker (separate process): WatchBitcoinPayments.runOnce() every ~45s
  → poll each awaiting address (Esplora) → enough confirmations?
      → emit normalized PaymentEvent → ConfirmPayment → order.status = paid
  → the ONLY path to "paid". There is NO webhook for BTC — poll-based by design.
```

Key property: the watcher reconciles from chain state each pass, so a restart never loses a
payment — confirmations just arrive a cycle late.

## Annotated file map (with build status)

```
src/
├── config/env.ts                         [built] Zod-validated env; ONLY place process.env is read
├── composition/container.ts              [built] DI root; getContainer() wires adapters → use cases
│
├── shared/
│   ├── domain/
│   │   ├── result.ts                     [built] Result<T,E>; no throwing across boundaries
│   │   └── money.ts                      [built] integer minor units + currency; never floats
│   └── infrastructure/
│       ├── db/{client,schema}.ts         [built] Drizzle (postgres-js); orders, order_lines,
│       │                                         bitcoin_payment_intents
│       └── redis/client.ts               [built] ioredis singleton
│
├── modules/
│   ├── checkout/application/use-cases/
│   │   └── start-checkout.ts             [built] reprice + reserve + createPayment
│   │
│   ├── orders/
│   │   ├── domain/order-status.ts        [built] guarded payment state machine
│   │   ├── application/use-cases/
│   │   │   └── confirm-payment.ts        [built] ONLY place status→paid; provider-agnostic
│   │   └── infrastructure/
│   │       ├── drizzle-order-repository.ts        [built] checkout + confirm order ports
│   │       ├── redis-processed-event-store.ts     [built] idempotent event de-dup
│   │       └── logging-fulfillment-queue.ts       [STUB] logs; replace with BullMQ
│   │
│   ├── inventory/infrastructure/
│   │   └── redis-inventory-reservation.ts [PARTIAL] reservation lifecycle only;
│   │                                                NOT enforcing stock yet (no catalog table)
│   │
│   ├── payments/
│   │   ├── application/
│   │   │   ├── payment-provider.ts        [built] PaymentProvider/Method/Event vocabulary
│   │   │   ├── payment-gateway-registry.ts[built] resolve gateway by provider
│   │   │   ├── watch-bitcoin-payments.ts  [built] the poller → PaymentEvent
│   │   │   └── ports/
│   │   │       ├── payment-gateway.ts     [built] the abstraction (createPayment)
│   │   │       └── bitcoin-ports.ts       [built] rate / chain-data / allocator / store ports
│   │   └── infrastructure/
│   │       ├── onchain-bitcoin-payment-gateway.ts [built] derive addr, lock quote, BIP21
│   │       └── bitcoin/
│   │           ├── address-deriver.ts             [built] xpub → bc1q addr (ONLY deriver)
│   │           ├── redis-address-index-allocator.ts [built] atomic INCR + seedFloor
│   │           ├── drizzle-bitcoin-payment-store.ts [built] intent persistence
│   │           ├── esplora-chain-data-provider.ts [built] mempool.space / self-host electrs
│   │           └── mempool-rate-provider.ts       [built] fiat→sats, short cache
│   │
│   ├── catalog/  identity/  cart/         [NOT BUILT] scaffolded in PROJECT_STRUCTURE only
│
├── app/
│   ├── (storefront)/checkout/
│   │   └── BitcoinCheckout.tsx            [built] address + amount + QR, polls status
│   └── api/
│       ├── checkout/route.ts             [built] DEV entry: create order + start checkout
│       └── orders/[id]/status/route.ts   [built] maps domain status → 4 widget states
│
└── workers/btc-watcher.ts                [built] worker process; interval loop (BullMQ later)
```

## State (what's real vs. stubbed)

**Real & compiling:** the entire BTC payment path — checkout → derive address → persist intent
→ render QR → watcher → confirm → status. Verified with `tsc --noEmit` against real deps.

**Stubbed / partial (intentionally, marked in-code):**
- `redis-inventory-reservation.ts` — manages reservation lifecycle but does **not** enforce
  stock (no catalog/inventory table yet). Can't oversell today because it tracks nothing; the
  atomic check-and-decrement lands here when the inventory module does.
- `logging-fulfillment-queue.ts` — logs the "order paid" trigger; swap for a BullMQ producer.
- `workers/btc-watcher.ts` — plain interval loop; BullMQ repeat is the production upgrade.
- `/api/checkout` — DEV convenience that mints an order from a raw amount; real orders come
  from cart checkout.
- `drizzle-order-repository.repriceAndGetTotal` — returns the persisted total; real repricing
  recomputes from order_lines × catalog once catalog exists.

**Not built:** catalog, cart, identity modules; BullMQ setup; tests; the storefront pages
beyond the checkout component.

## Run it

```bash
npm install
cp .env.example .env        # set BTC_ACCOUNT_XPUB (xpub only!), DATABASE_URL, REDIS_URL
npm run db:push             # create tables
npm run dev                 # web app
npm run worker              # chain-watcher (separate terminal / container)
# exercise: POST /api/checkout { "amountMinor": 4999, "currency": "USD", "customerEmail": "..." }
```

## Hard rules (full list in CLAUDE.md — the ones most likely to trip you)

- **Xpub only on the server.** Never a seed/mnemonic/xprv. The server derives, never spends.
- **Unique address per order**, index from atomic Redis INCR. Never reuse an address.
- **`paid` is set only in `ConfirmPayment`**, driven by the watcher. No other path.
- **No webhook for on-chain BTC** — it's poll-based by design; don't add one.
- **Never floats for money** (fiat or BTC); **never trust a client-submitted price**.
- **Never read-then-write inventory** — atomic decrement when that lands.

## Suggested next steps

1. Docker: multi-stage Dockerfile (arm64/amd64-safe for `tiny-secp256k1`), 5-service compose
   (web, worker, postgres, redis, Caddy), Caddyfile.
2. Real inventory: catalog + stock tables, atomic reserve in `redis-inventory-reservation`.
3. BullMQ: replace the interval worker + logging fulfillment queue.
4. Tests: the domain + use cases are designed to run without infra — start there.
