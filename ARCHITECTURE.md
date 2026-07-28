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

2. **Bounded contexts** live under `src/modules/*` (`catalog`, `cart`, `checkout`,
   `orders`, `payments`, `identity`), each with its own `domain` / `application` /
   `infrastructure`. Shared kernel is `src/shared`.

3. **One payment abstraction.** Everything goes through the `PaymentGateway` port. The BTC
   adapter is the only implementation today; the port stays a port so a second method could be
   added without touching anything downstream. On-chain state is normalized into a
   `PaymentEvent` that the domain consumes — the domain never touches bitcoin libraries.

## The one flow that matters (BTC checkout)

```
checkout server action (cart → order)
  → StartCheckout: reprice (server-side) → gateway.createPayment
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
│   │       └── supplier-order-fulfillment-queue.ts [built] creates supplier orders on paid
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
│   ├── catalog/ cart/ identity/ addresses/ analytics/ audit/ checkout/ coupons/
│   ├── notifications/ reviews/ shipping/ sourcing/   [built]
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
- `workers/btc-watcher.ts` — plain interval loop; BullMQ repeat is the production upgrade.

There is **no inventory module and never will be** — this is a dropship model, so a product
either exists in the catalog or it doesn't. See the Inventory section of CLAUDE.md before
adding a reservation of any kind.

`/api/checkout` used to be listed here as a dev convenience that minted an order from a raw
posted amount. It was removed: unauthenticated, unrated, and every call burned a BTC address
index off the monotonic counter, which is exactly the thing that can outrun a watch-only
wallet's BIP32 gap limit. Real orders come from the cart checkout action.

## Run it

```bash
npm install
cp .env.example .env        # set BTC_ACCOUNT_XPUB (xpub only!), DATABASE_URL, REDIS_URL
npm run db:migrate          # apply migrations (not db:push — migrations are checked in)
npm run dev                 # web app
npm run queue:dev           # chain-watcher (separate terminal / container)
```

## Hard rules (full list in CLAUDE.md — the ones most likely to trip you)

- **Xpub only on the server.** Never a seed/mnemonic/xprv. The server derives, never spends.
- **Unique address per order**, index from atomic Redis INCR. Never reuse an address.
- **`paid` is set only in `ConfirmPayment`**, driven by the watcher. No other path.
- **No webhook for on-chain BTC** — it's poll-based by design; don't add one.
- **Never floats for money** (fiat or BTC); **never trust a client-submitted price**.
- **No local stock at all** — dropship; "out of stock" means the product is gone from the
  catalog. Don't add a reservation without reading CLAUDE.md's Inventory section first.

## Suggested next steps

1. BullMQ: replace the plain interval loop in `workers/btc-watcher.ts` with a repeat job.
2. Error monitoring — there is none, so a production exception is only ever a log line.

Docker, the catalog/cart/identity modules, the storefront and admin pages, and the test suite
(700+ specs, no infra needed) were all on this list and are done.
