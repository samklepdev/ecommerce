# CLAUDE.md

Guidance for working in this repository. Read this before making changes.

## What this is

A Next.js (App Router) e-commerce storefront built on Clean Architecture / DDD. The web
framework and the payment provider are **adapters** — the domain layer depends on neither.
See `PROJECT_STRUCTURE.md` for the full directory layout.

Payment is a single method: **non-custodial on-chain Bitcoin**. Each order gets a unique
receive address derived from a watch-only account xpub; settlement is confirmed by a
chain-watcher poller. No third-party processor, no custody of funds, no card rails.

## Stack

- **Next.js** (App Router) + **TypeScript** (strict mode, no implicit `any`)
- **PostgreSQL** + **Drizzle** ORM
- **Redis** (carts, idempotency keys, BTC address-index counter, rate limiting)
- **No queue yet.** BullMQ is the intended destination for async work and is *not installed*;
  the BTC watcher is a standalone interval process (`src/workers/btc-watcher.ts`) and email
  and fulfillment run inline in the request path
- **bitcoinjs-lib + bip32 + tiny-secp256k1** for HD address derivation; **qrcode.react** for
  the checkout QR
- **Zod** for validation at every boundary

## Architecture rules (non-negotiable)

The dependency rule points **inward**. Violating any of these is a bug, not a style choice.

1. **`src/modules/*/domain/**` imports only from `src/shared/domain`.** No Drizzle, no bitcoin
   libs, no `next/*`, no Redis. Pure TypeScript.
2. **Ports (interfaces) live in `application/ports`; implementations live in `infrastructure`.**
   Use cases depend on the port, never the concrete adapter.
3. **`src/app/**` (presentation) calls use cases only** — never repositories, never the DB
   client directly. Route handlers and server actions stay thin: validate input, resolve the
   use case from `src/composition/container.ts`, return.
4. **Exactly one file derives addresses**
   (`payments/infrastructure/bitcoin/address-deriver.ts`). Need more provider behavior? Extend
   the `PaymentGateway` port, don't leak library details across layers.
5. **Cross-boundary results use `Result<T, E>`** (`shared/domain/result.ts`). Don't throw
   domain errors across layers; return them.

## Money

- **Never use floats for money.** Use the `Money` value object (`shared/domain/money.ts`):
  integer minor units + explicit currency. Every amount carries its currency.
- All arithmetic goes through `Money` methods. No `price * quantity` on raw numbers.
- **BTC amounts are integer satoshis**, never floats. Convert for display only
  (`satsToBtcString`, e.g. `157001 → "0.00157001"`).

## Payments: the abstraction

Payment goes through the `PaymentGateway` port
(`payments/application/ports/payment-gateway.ts`), implemented by
`OnChainBitcoinPaymentGateway`. The gateway normalizes on-chain state into a `PaymentEvent`
(`payments/application/payment-provider.ts`), which `ConfirmPayment` and the order state
machine consume — so the domain never touches bitcoin libraries directly. The port stays a
port: if a second method is ever added, it implements `PaymentGateway` and nothing downstream
changes.

`StartCheckout` (`checkout/application/use-cases/start-checkout.ts`) reprices server-side →
reserves inventory → calls `createPayment` → returns a `PaymentSession` carrying a BIP21 URI
(`bitcoin:<addr>?amount=<btc>`) for the QR, plus the raw address and expected sats.

## Payment state (read this twice)

- **The chain is the source of truth for payment state, not our DB.** Order payment status is
  a **projection of confirmed on-chain events**, never set synchronously at checkout.
- The ONLY place an order moves to `paid` is `orders/application/use-cases/confirm-payment.ts`,
  driven by the chain-watcher (`payments/application/watch-bitcoin-payments.ts`) once the
  order's address has enough confirmations.
- **On-chain BTC has no webhook** — settlement is detected by polling. Do not add one.
- Watcher passes are **re-run** — `ConfirmPayment` de-dupes by event id and the state machine
  drops illegal/stale transitions.

## Bitcoin payments (non-custodial — do not compromise this)

- **The server holds ONLY the account xpub** (`BTC_ACCOUNT_XPUB`, a watch-only public key,
  e.g. the export of `m/84'/0'/0'`). It can derive receive addresses but **cannot spend**.
  **Never** put a seed, mnemonic, or xprv on the server or in env. A server compromise must
  not be able to move funds.
- **One unique address per order.** `AddressIndexAllocator.next()` hands out a fresh,
  monotonic index (Redis `INCR` — must be atomic so concurrent checkouts never collide), and
  `HdAddressDeriver` derives a `bc1q…` address at path `0/index`. **Never reuse an address** —
  reuse destroys order↔payment correlation and leaks revenue history on-chain.
- The index counter only moves forward and **must survive restarts**. Seed it above the
  wallet's real next-unused index; never reset it. If Redis is wiped, reseed from the highest
  index the wallet has seen.
- **BIP32 gap limit:** watch-only wallets stop scanning after ~20 consecutive unused
  addresses. High abandoned-checkout volume can outrun this — raise the scan gap limit on the
  watching wallet if needed.
- **Two clocks, deliberately.** `QUOTE_TTL_SECONDS` (default 15 min) is the rate lock — every
  minute of it is BTC/USD exposure on a price already quoted.
  `ORDER_PAYMENT_WINDOW_HOURS` (default 24) is how long the ORDER stays open.
  A lapsed quote does **not** expire the order: the customer re-quotes
  (`RefreshPaymentQuote`) and gets today's price on the **same address**. Only the order
  deadline expires an order, and `listWatchable` keys off that same deadline — watching must
  outlive the quote, or a customer paying against a stale QR sends real BTC to an address
  nobody is polling.
- **Confirmations:** `BTC_REQUIRED_CONFIRMATIONS` (default 2). Seen-but-shallow →
  `awaiting_confirmation`, never fulfilled.
- **Underpayment is not payment.** `confirmedSats < expectedSats − dustTolerance` stays in
  `awaiting_confirmation` for review; never auto-fulfill it.
- **Refunds are manual, out-of-band** on-chain sends — crypto is irreversible. The `refunded`
  state exists but is driven from ops tooling, not an API call.
- **Privacy:** the default Esplora provider is the public `mempool.space` API, which sees every
  address you query (dev only). In production run your own `electrs`/Esplora or `bitcoind`.
  Repoint `BTC_ESPLORA_URL` only — the rate feed has its own `BTC_RATE_URL` because
  `/v1/prices` is a mempool.space extension, not an Esplora endpoint.
- **Compliance:** with no processor in the flow, we own what one would otherwise absorb —
  AML/sanctions screening and tax reporting obligations vary by jurisdiction and what's sold.
  This is a standing consideration, not a code detail; flag it when payment scope changes.

## The kill switch

`store:closed` in Redis. Absent means open — the store's default state can't
depend on a write having succeeded.

- **Two reads, opposite failure modes, on purpose.** `AssertStoreOpenForCheckout`
  (in `PlaceOrder` and `StartCheckout`) fails **closed**: if the switch can't be read we
  don't take money, which costs nothing because checkout needs Redis for the address-index
  `INCR` anyway. `GetStoreAvailability` (the storefront layout, `/api/health`) fails
  **open**: a Redis blip must not take a browsable catalogue down, and it runs during
  `next build`, where Redis is deliberately absent.
- **The closed page is cosmetic; the use-case guard is what holds.** A server action can be
  POSTed at directly. Never move the check into the UI only.
- **Only `(storefront)` is gated at the layout.** `(admin)` stays reachable, and so does
  `/login` — closing the store must not lock you out of the console you reopen it from.
- **While closed, only admins may sign in.** `logInAction` checks credentials, then keeps the
  session only for an admin; everyone else gets the same message a wrong password produces,
  so a closure isn't an oracle for which emails have accounts. `/signup` and
  `/forgot-password` are paused (new rows, outbound mail); `/reset-password` and
  `/verify-email` stay open because they finish a flow someone was already emailed and those
  tokens expire.
- **Customer writes are refused, not merely hidden** — cart, wishlist, reviews, inquiries all
  check `isStoreOpen()` (`src/app/lib/store-open.ts`), because hiding a page doesn't stop a
  direct POST to its action.
- **The watcher is untouched.** Orders already paid still settle and ship — closing the
  front door must not strand someone who paid before you shut it.
- **`/api/health` reports `storeOpen` but stays 200 when closed.** A 503 would have the load
  balancer pull the instance and take admin with it.
- Three triggers, all audited (`store.closed` / `store.opened`, actor `cli` / `ops-url` /
  the admin's email): the admin toggle, `npm run store:close`, and the ops URL.
- **The ops URL carries two secrets, neither in this repo**: `STORE_SWITCH_PATH` (the path
  segment itself) and `STORE_SWITCH_TOTP_SECRET` (a 6-digit rotating code). Unset either and
  the route 404s. Generate both with `npm run store:switch-setup`.
  A rotating code rather than a static token because the URL inevitably lands in access logs
  and browser history — a code there is dead in 30 seconds, and a used step is burned so it
  can't be replayed inside its own window. Every rejection returns an identical 404: one that
  distinguished a wrong path from a wrong code would confirm the endpoint exists.
  The failed-attempt budget is **global, not per-IP** (`getClientIp` reads a spoofable
  header) and is checked **only after** a correct path, so a valid code is never rate-limited
  — an attacker can't lock you out of your own switch.
  It is unguessable, not unreachable: anyone holding both secrets can call it from anywhere.
  Put it behind Tailscale/WireGuard if that matters.

## Idempotency

Every mutating money- or inventory-touching operation **must** be idempotent:

- De-dupe watcher events by event id in `ConfirmPayment` (`ProcessedEventStore`).
- BTC `createPayment` returns the existing intent if the order already has one awaiting, so a
  double-submit never allocates a second address.

## Inventory

There is **no local stock** — this is a dropship/arbitrage model. `Product` carries no
quantity field, and `start-checkout.ts` sources items from suppliers only *after*
payment confirms (`CreateSupplierOrdersForPaidOrder`). No reservation, no TTL, nothing to
oversell. "Out of stock" means the product no longer exists in the catalog (deleted/archived),
not a quantity check — see `PlaceOrder`'s `product_unavailable` error. If a real local-stock
model is ever introduced, the classic read-then-write race (`SELECT stock; if > 0 then
UPDATE`) still applies and must be avoided via `SELECT ... FOR UPDATE` or an atomic conditional
update — but that's not the system as it exists today.

## Cart

- **Re-price at checkout. Never trust a client-submitted price.** The reprice step is the
  authority; client price is display-only.
- Guest carts live in Redis by session id; merged into the user's cart on login.
- "Item went out of stock between add and checkout" means the product was removed from the
  catalog, not a quantity check (see Inventory above) — `PlaceOrder` returns
  `product_unavailable` for this.

## Order state machine

`orders/domain/order-status.ts` — **explicit, guarded transitions**, not a free-form string.
Payment and fulfillment are **separate** machines that reference each other.

- Payment: `pending → awaiting_payment → awaiting_confirmation → paid → refunded`, plus
  `failed` / `expired` branches. `awaiting_confirmation` covers BTC's on-chain lag.
- Fulfillment: `unfulfilled → processing → shipped → delivered` (+ `cancelled`), starts only
  after payment reaches `paid`.
- Illegal transitions throw at the boundary (`assertTransition`). Add states here, never as
  ad-hoc string checks in use cases.

## Next.js caching

- Product / category / home: **ISR / cached** (read-heavy, rarely change).
- Cart / checkout / account: **dynamic, never cached.** The BTC status route is
  `force-dynamic`, `runtime = 'nodejs'`.
- Product detail pages implement `generateMetadata` for per-product OG/SEO tags.
- **Danger:** never cache personalized data (cart, user-tied prices). When unsure about the
  `fetch` cache / `revalidate` boundary, make it dynamic and leave a `// CACHE:` note.

## Async / side effects

- **What the code actually does today** — BullMQ is not installed. The BTC chain-watcher is a
  standalone process (`src/workers/btc-watcher.ts`) running a plain interval loop; email and
  supplier-order creation run **inline in the request path**. Treat the queue as the target
  state, not the current one, and keep every worker idempotent so moving to it is a
  transport change and nothing more.
- The watcher runs on a repeat schedule (~30–60s): `WatchBitcoinPayments.runOnce()`.
- **Run exactly one watcher.** No lock, no leader election — a second replica only doubles
  load on the Esplora provider.
- It records a heartbeat after every successful chain pass; `/api/health` fails when that
  goes stale. This process dying is otherwise silent: orders just stop settling.

## Conventions

- Files: `kebab-case.ts`. Classes/types: `PascalCase`. Use cases: verb-first.
- Validate all external input (route handlers, actions) with **Zod**.
- **Parse third-party responses, don't cast them.** `as SomeType` on a
  `res.json()` is a claim, not a check. Chain data and the BTC rate feed both
  decide money, and both are parsed (`esplora-response.ts`, `rate-response.ts`).
- **Fetch user- or feed-supplied URLs with `safeFetch`** (`shared/infrastructure`),
  never bare `fetch`. It refuses private/loopback/link-local targets and re-checks
  every redirect hop. Bare `fetch` is fine only for operator-configured URLs from
  `env.ts`.
- Wire dependencies in `src/composition/container.ts` — the single DI root. Don't `new` an
  adapter inside a use case.
- Environment access only through `src/config/env.ts` (Zod-validated). Never read
  `process.env` directly elsewhere.

## Commands

```bash
npm run dev              # Next dev server
npm run build && npm start # production build + serve
npm run typecheck        # tsc --noEmit
npm run lint             # eslint
npm test                 # unit tests (domain + use cases run without infra)
npm run db:generate      # drizzle-kit generate (migrations)
npm run db:migrate       # apply migrations
npm run db:studio        # drizzle studio
npm run queue:dev        # run the BTC watcher locally (tsx watch; no queue involved)
npm run admin:promote -- <email>  # promote an existing account to admin
npm run store:close      # kill switch: shut the storefront (optionally: -- "reason")
npm run store:open       # reopen it
npm run store:status     # is it open?
npm run store:switch-setup  # generate the ops URL's path + TOTP secret (prints a QR)
```

## Git workflow

- Repository: `https://github.com/samklepdev/ecommerce` (remote name `origin`).
- Default branch: `main`. Feature work happens on branches named `feat/<short-name>`
  (e.g. `feat/arch-init`, `feat/design-init`) and merges back to `main` via a GitHub
  pull request — don't commit directly to `main`.
- Push with a normal `git push -u origin <branch>` on first push. Never force-push
  `main`.

## Dependencies to install

```bash
npm install bitcoinjs-lib bip32 tiny-secp256k1 qrcode.react ioredis zod
npm install -D drizzle-kit
```

## When adding a feature

1. Model it in `domain` first (entity/VO + invariants), with unit tests. No infra.
2. Define the use case in `application` + any new `port` it needs.
3. Implement the port in `infrastructure` (Drizzle / bitcoin / Redis adapter).
4. Wire it in `composition/container.ts`.
5. Expose it via a thin server action or route handler in `app/`.
6. If it changes what a customer or admin can do, update `docs/features.md` in the same PR.

Domain and use-case tests must run **without** a database or network.

## Current state

The storefront and admin console are both built and running against a real
database: catalog, cart, checkout, the on-chain BTC payment path (derivation,
watcher, confirmation, order state machine), fulfillment/supplier ordering,
reviews, coupons, accounts, and the analytics dashboard.

Everything the previous version of this section listed as "not yet built" —
the DI root, the Redis/Drizzle adapters, the order status endpoint, the
schema and migrations, and a rate provider — exists. Check the tree before
trusting a list like that; it dates faster than anything else in this file.

Worth knowing rather than rediscovering:

- **Migrations are in `drizzle/`** (22 so far). `db:generate` prompts
  interactively when it can't tell a rename from a drop, so a migration that
  needs data moved between steps is hand-written with a matching snapshot —
  see `0021_remove_product_variants.sql`.
- **There are no product variants.** The product is the sellable unit and
  carries its own sku and price. Anything still saying otherwise is stale.
- **Categories are a table**, not a string on the product (0022/0023).
  `products.category_id` is the FK; `Product.category` is the display name,
  hydrated on read, and `Product.categoryId` is what writes use. The
  storefront's `?category=` accepts a slug or a name. Deleting a category
  uncategorizes its products (ON DELETE SET NULL) rather than taking them
  with it.
- **Admin pages are themed on `.shell`**, the storefront on `.storefront`.
  Both are marked `data-theme-scope`, and anything portaled (see `Modal`)
  must land inside one or it resolves the bare `:root` palette instead.

## Do not

- Do not put business logic in server components, actions, or route handlers.
- Do not import infrastructure from domain.
- Do not set `paid` outside `ConfirmPayment` (watcher-driven).
- Do not put a seed / mnemonic / xprv on the server. Xpub only.
- Do not reuse a BTC address or hand out an address index non-atomically.
- Do not add a webhook for on-chain BTC — it's poll-based by design.
- Do not use floats for money (fiat or BTC), or trust client-submitted prices.
- Do not `fetch` a URL that came from a form or a supplier feed without
  `safeFetch` — that's how you get the server reading cloud metadata or its own
  Redis.
- Do not trust an uploaded file's declared content type; the bytes decide
  (`shared/infrastructure/image-type.ts`).
- Do not read-then-write inventory.
- Do not log a rendered email body. Reset and verification links are bearer tokens; one
  log line is an account takeover.
- Do not build a guest cart key from a possibly-empty session id — every visitor without
  one then shares a single cart.
- Do not use `findById`/`findBySlug` (active-only) for admin lookups, or the `findAny*`
  variants for anything a customer can reach.

## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues (samklepdev/ecommerce), using the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context layout — `CONTEXT.md` + `docs/adr/` at the repo root (neither exists yet; created lazily by domain-modeling when needed). See `docs/agents/domain.md`.
