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
- **BullMQ** for after-the-response work (mail, supplier ordering) — `JobQueue` port,
  `BullMqJobQueue` adapter, handlers in `src/workers/job-worker.ts`. See *Async / side effects*.
  The BTC watcher stays a standalone interval process (`src/workers/btc-watcher.ts`) and hosts
  the job worker in the same process
- **bitcoinjs-lib + bip32 + tiny-secp256k1** for HD address derivation; **qrcode.react** for
  the checkout QR
- **Zod** for validation at every boundary
- **react-email** (`@react-email/components`) for outbound email. Templates are `.tsx`
  components next to the use cases that send them, sharing one `EmailLayout`; see
  *Email* below

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
- **While closed, only admins may sign in**, and **closing signs every customer out**
  (`CustomerSessionRevoker`; `SCAN`, never `KEYS` — Redis is on every request path here).
  Admin sessions survive, or you'd log yourself out by closing. `logInAction` checks
  credentials, then keeps the session only for an admin; everyone else gets the same message
  a wrong password produces, and the login page looks identical open or closed. **Don't add a
  "we're closed" banner there** — it announces the state of the business and turns the form
  into an oracle for which emails have accounts. `/signup` and
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

## Sessions

- **Two clocks.** `SESSION_TTL_SECONDS` (30 days) is the hard ceiling; the idle window is
  what actually ends most sessions. Customers get `SESSION_IDLE_TIMEOUT_SECONDS` (14 days),
  admins `ADMIN_SESSION_IDLE_TIMEOUT_SECONDS` (1 hour) — an admin session can refund money
  and delete a catalogue, a customer's can look at their own orders.
- The idle window is chosen **at login**, from the role, and stored on the session. Only the
  window: authorization still reads the role from the database on every request.
- **Redis' TTL is what enforces idleness** — set to whichever clock expires first, so an idle
  session disappears even if nothing ever reads it again. `lastSeenAt` is only rewritten
  every 60s (`TOUCH_THROTTLE_SECONDS`); Redis is on every request path here and a write per
  request is not free.
- **Destructive admin actions need sudo mode**: refund, promote, and every delete call
  `requireRecentAdminAuth()`, which needs the password typed within
  `ADMIN_REAUTH_WINDOW_SECONDS` (15 min). Logging in counts. Browsing does **not** extend it —
  it's bought by typing the password, not by being present.
- Confirming the password does not replay the blocked action. Silently deleting something the
  moment a password lands turns the prompt into a second confirm dialog.

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

- **BullMQ runs the after-the-response work.** Order confirmation, welcome and verification
  mail, the payment-confirmed email, and supplier-order creation are all jobs now
  (`JobQueue` port, `BullMqJobQueue` adapter, handlers in `src/workers/job-worker.ts`).
  Five attempts with exponential backoff; whatever exhausts them stays in BullMQ's failed set,
  which is the dead-letter queue, and `/api/health` reports the depths.
- **Job ids must not contain `:`** — BullMQ builds its own keys with colons and rejects a
  custom id containing one *at enqueue time*. **Build every id with `jobIdFor`** (in the
  `JobQueue` port), which replaces colons and dots so the rule can't be broken by hand; it
  refuses an empty part, because that collapses `fulfillment-<orderId>` to `fulfillment-` for
  every order.
- **Job payloads are parsed, not cast** (`job-payload-schemas.ts`). `job.data` is `any` off
  Redis and may have been enqueued by a previous deploy, so it crosses a boundary like any
  other external input. A payload that fails to parse is **dropped, not retried** — it won't
  parse on the fifth attempt either.
- **A deterministic job id is a second line of defence, not the guard.** BullMQ dedupes a
  repeated id only while that job still exists in Redis, and completed jobs are evicted on
  `removeOnComplete` (an hour, or 1000 jobs) — past that the same id enqueues again. So the
  watcher re-running its pass every 45s is safe because `ConfirmPayment` returns early once an
  order is `paid` and `CreateSupplierOrdersForPaidOrder` skips lines already covered — the id
  just saves the duplicate work inside the window. **Don't let a deterministic id stand in for
  a handler that's actually idempotent.**
- **Conversely, don't give a stable id to something a customer can legitimately repeat.**
  Signup's `email-verification-<userId>` is fine because it happens once per account; the
  resend button and change-email enqueue with **no** id, because a stable one would be deduped
  into nothing inside the retention window and the action would report success having sent no
  mail.
- **Payloads carry ids, not objects.** A job may run minutes later, after a deploy, on another
  process; anything it carries is a snapshot that may already be stale, so handlers re-read.
- **The chain watcher is still a loop**, not a repeatable job, and deliberately so: it is a
  poller with a heartbeat that `/api/health` watches, and converting the one thing that
  notices a customer paid buys visibility it already has. The job worker runs in the same
  process (`src/workers/btc-watcher.ts`) — split them when queue volume starts competing with
  the poll interval.
- The watcher runs on a repeat schedule (~30–60s): `WatchBitcoinPayments.runOnce()`.
- **Run exactly one watcher.** No lock, no leader election — a second replica only doubles
  load on the Esplora provider.
- **Two reconcilers back the sourcing path, and they cover different failures.**
  `ConfirmPayment` only marks its event seen once every side effect completed, so an enqueue
  that *fails* is retried by the next watcher pass. `ReconcileUnsourcedPaidOrders` covers an
  enqueue that *succeeded* and whose job was then lost: it re-queues any `paid` order with a
  line no supplier order covers and no fulfillment issue. The unflagged part is the whole
  trick — a flagged line is a known problem already in `/admin/fulfillment`, and re-queueing
  it would log forever and fix nothing.
- **Expiry stops promising, not looking.** `listWatchable` drops an intent once the order
  closes, so `SweepLatePayments` re-checks recently `expired`/`cancelled` addresses on an
  hourly clock and flags anything holding coins (`bitcoin_payment_intents.late_payment_sats`,
  surfaced as a dashboard tile). It deliberately does **not** confirm the payment or move the
  order — resurrecting a closed order because coins turned up would make a business decision
  by accident. `markCancelled` drops an intent from watching too, which is why the state
  machine's `cancelled -> paid` path needs this sweep to be reachable at all.
- It records a heartbeat after every successful chain pass; `/api/health` fails when that
  goes stale. This process dying is otherwise silent: orders just stop settling.

## Email

- **Templates are react-email `.tsx` components**, never hand-written HTML strings. They
  live beside the use case that sends them and all wrap `EmailLayout`
  (`notifications/application/emails/`), which owns the shell — plain, system fonts, no
  branding, one place to add a logo.
- **This is a correctness rule, not a styling one.** The string templates interpolated
  values straight into markup, so an admin-entered tracking number or carrier label
  containing `<` broke the email or injected into it. **JSX escapes its children**, so
  don't reintroduce a template literal to "just add one line".
- **Every email ships an HTML *and* a plain-text part.** `renderEmail` returns both
  (`render(node, { plainText: true })` gives the text one). A message with no text part
  scores worse with spam filters, and these are the emails a customer must receive — an
  order confirmation carries the only link back to a guest's order.
- **`render` is async**, so every `renderXEmail` returns a promise. Every caller is
  already an async use case, so this costs an `await`.
- **Set `preview` on every template.** Unset, clients scrape the first words of the body,
  which for a receipt is the greeting repeated back next to the subject.
- Templates stay **pure** — no repositories, no `env`, no I/O — so `npm test` renders them
  for real without a database or network. The only remaining hand-written HTML email is
  `inquiries/infrastructure/email-inquiry-notifier.ts` (admin-facing, escapes by hand).
- `EmailSender.send` takes one `EmailMessage` object. Resend omits `text` when absent
  rather than sending it blank, which some clients render as an empty message.

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
npm test                 # fast suite: domain + use cases, no infra at all
npm run test:integration:up    # start throwaway Postgres/Redis (ports 5433/6380)
npm run test:integration       # repository + Redis adapter tests against them
npm run test:integration:down  # stop them and drop the data
npm run db:generate      # drizzle-kit generate (migrations)
npm run db:migrate       # apply migrations
npm run db:studio        # drizzle studio
npm run queue:dev        # run the BTC watcher + job worker locally (tsx watch; one process)
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

Domain and use-case tests must run **without** a database or network — that's what
`npm test` is, and it stays that way.

Anything whose behaviour lives in SQL or in Redis semantics needs the second suite
(`*.integration.test.ts`, `npm run test:integration`), because a fake repository is a
second implementation of the rule and can't disagree with itself. The active-only
filter, `getUsage`'s counts, the sourceable-offer fallback, address-index atomicity
under concurrency and the session revoker's keyspace walk are all there for that
reason — each one either shipped a bug or guards money. The suite talks to
`docker-compose.test.yml` on ports 5433/6380, never your dev stack, and truncates
every table between cases.

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
  see `0021_remove_product_variants.sql` and `0028_remove_product_sku.sql`.
- **Every new migration's `_journal.json` `when` must exceed every entry
  already there, not just the last one — and this bites generated migrations
  too.** The journal is *not* in chronological order: `0021` was hand-stamped
  `1785600000000` (2026-08-01T16:00Z), which was in the *future* when it was
  written. `migrate()` skips anything whose `when` is below the newest
  already-applied `created_at` — silently, with no error and no DDL. `0029` was
  generated by `db:generate` with a correct wall-clock `when` and still had to
  be bumped by hand, because real time hadn't caught up to `0021` yet. **After
  generating a migration, check it will actually apply**; it self-heals once
  wall-clock passes the bogus stamp, but until then every new migration is
  affected.
- **There are no product variants.** The product is the sellable unit and
  carries its own price. Anything still saying otherwise is stale.
- **There is no SKU** (0028). This is a dropship store: no warehouse, no
  supplier catalogue keyed by our identifier, so the field was written at
  creation and read by nobody. An order line snapshots
  `product_name` instead — what the product was called when it was bought, so
  a later rename can't rewrite an old receipt. A supplier *feed* may still
  carry its own `sku` column; `feed-row-mapper.ts` reads it as one candidate
  for an external id, which is someone else's identifier, not ours.
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
