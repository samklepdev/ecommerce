# Features

What this app can do today, at a glance — for anyone (new admin, teammate,
stakeholder) who wants the full picture without reading code. Organized by
who uses it. Not an architecture doc (see `CLAUDE.md`) or a deployment doc
(see `docs/deployment.md`) — just capabilities.

**Keep this updated.** Whenever a feature is added or changed, update the
relevant section here in the same PR (see `CLAUDE.md`'s "When adding a
feature" checklist).

## Storefront (customers)

- **Browse products** (`/products`) — grid of published products, with
  text search (by name), an optional category filter, and page-based
  navigation. Each card has a quantity stepper, decimal price, and an
  inline "Add to cart" button (no need to open the product page first).
  Targets whichever variant has a preferred supplier offer configured.
- **Product detail** (`/products/[slug]`) — image gallery, all variants
  with price and availability, add to cart. "Out of stock" means the
  supplier marked it unavailable, not a quantity count — this store holds
  no inventory (dropship/arbitrage model).
- **Cart** (`/cart`) — line items with a quantity stepper (persists
  immediately, no separate save step), remove, running subtotal, link to
  checkout. Guest carts live in a cookie and merge into the account cart
  on login/signup.
- **Checkout** (`/checkout`) — email + shipping address, server-side
  repricing (never trusts the cart's stored price), creates a unique BTC
  receive address for the order, redirects to a real bookmarkable
  order-status URL. Shows a subtotal/shipping/total summary before the
  customer submits.
- **Shipping** — a single flat-rate fee, admin-configurable, added once per
  order (not per item). Shown on product pages, the cart, and checkout, and
  snapshotted onto the order at placement so a later rate change never
  alters an existing order's total or the BTC amount already quoted for it.
- **Order status / confirmation** (`/orders/[id]`) — works for guests too
  (the order ID itself is the access key, same as the polling API). Shows
  payment/fulfillment status, line items, shipping address, tracking
  numbers, and — while payment is pending — a live-updating BTC payment
  widget: QR code, BIP21 URI, countdown to quote expiry, confirmation
  count, and clear messaging for underpaid or overpaid amounts. A
  customer can cancel the order themselves any time before the chain has
  seen a payment (`pending`/`awaiting_payment`) — once BTC is in flight,
  cancellation is no longer offered.
- **Account** (`/account`) — profile, avatar upload, change password,
  change email (re-triggers verification), delete account (password
  confirmation required; past orders are kept but unlinked from the
  account); a banner + resend button while the email is unverified;
  (`/account/orders`) — order history list and detail (same view as the
  guest order page, plus the login wall).
- **Auth** (`/signup`, `/login`, `/forgot-password`, `/reset-password/[token]`,
  `/verify-email/[token]`) — email/password accounts, rate-limited login
  and signup, password reset via emailed one-time token (doesn't reveal
  whether an email is registered), email verification via a similar
  emailed link (soft — unverified accounts can still log in and shop;
  it's just a reminder banner, not a login gate).
- **Emails** — welcome email (with open-tracking), verification email,
  order-confirmation email, payment-confirmed email. Sent via a
  console-log stub in dev/local; nothing is wired to a real provider yet.

## Admin (`/admin/*`, requires an admin account)

- **Products** (`/admin/products`) — create a product + its first variant
  + a preferred supplier offer in one form; import a batch of products
  from a supplier feed (URL, pasted JSON, or an uploaded spreadsheet); a
  "paste a product URL" helper that scrapes and prefills the add-product
  form; bulk publish/unpublish/delete; upload/manage product images;
  per-variant sell-price editing; per-offer supplier-cost editing; bulk
  "apply X% markup" across selected products' variants; a "No supplier
  offer" badge on any variant that could never actually be fulfilled;
  an editable category tag (free text) used by the storefront's category
  filter; filter the list by supplier.
- **Fulfillment** (`/admin/fulfillment`) — the ops queue of supplier
  orders (one per supplier per customer order), grouped by customer
  order. Mark a supplier order "ordered" (recording a reference) or
  "shipped" (recording a tracking number); both are editable afterward if
  mistyped. Cancel a supplier order — once every supplier order on a
  customer order is cancelled, the order itself is marked cancelled
  automatically. A banner surfaces any paid order line that couldn't be
  sourced (no supplier offer exists for that variant) so it doesn't
  silently vanish. Filter by status.
- **Orders** (`/admin/orders`) — every order in the store, searchable by
  customer email; (`/admin/orders/[id]`) — full detail (same view
  customers see) plus a "Mark refunded" action for orders that have
  already had a manual on-chain refund sent (refunds themselves are
  always a manual, out-of-band BTC send — this just records that it
  happened).
- **Users** (`/admin/users`) — look up an account by its exact email, see
  their profile and order history, promote them to admin. (Promoting the
  very first admin, before any admin account exists, is a one-time CLI
  step: `npm run admin:promote -- <email>`.) There's no browsing/searching
  across all customers yet — only exact-email lookup.
- **Settings** (`/admin/settings`) — the single global flat-rate shipping
  fee. Changing it only affects orders placed after the change; existing
  orders keep the rate they were placed under.

## Payments (non-custodial on-chain Bitcoin)

No card rails, no processor, no custody of funds — the server only ever
holds a watch-only public key.

- A unique receive address is derived per order (HD derivation from the
  account xpub) — never reused.
- Settlement is detected by polling the chain (no webhooks exist for
  on-chain BTC), on a repeating background job.
- Underpayment holds the order for manual review instead of auto-failing
  it; overpayment is flagged (for a manual refund of the difference)
  without holding up fulfillment.
- A quote (locked fiat→BTC rate) expires after a configurable window; the
  expiry check and the payment watcher share a grace window so a payment
  that lands right at the deadline is never missed.
- Once confirmed, the order can't be un-confirmed by a routine race — an
  extra "settlement buffer" of confirmations is required beyond the bare
  minimum before fulfillment triggers, as a small reorg-safety margin.

## Behind the scenes

- A background worker (`npm run worker` in production, `npm run queue:dev`
  locally) runs the BTC payment watcher and expires stale, unpaid
  checkouts — separate from the web process.
- `/api/health` — basic health check. `/api/orders/[id]/status` — the
  endpoint the order page polls for live payment progress.
- Docker (`Dockerfile` + `docker-compose.yml`) and a CI pipeline
  (typecheck, lint, test, and a real `next build`) exist for deploying
  and validating changes — see `docs/deployment.md` for what's still an
  open decision before going live with real money (hosting, image
  storage, running your own chain node, mainnet cutover).
