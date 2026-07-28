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
  text search (by name), an optional category filter, a sort control
  (newest, name A-Z/Z-A, price low-high/high-low), and page-based
  navigation. Each card has a quantity stepper, decimal price, and an
  inline "Add to cart" button (no need to open the product page first).
  Unavailable when the product's preferred supplier offer says so.
- **Product detail** (`/products/[slug]`) — image gallery, price,
  availability, and add to cart. "Out of stock" means the
  supplier marked it unavailable, not a quantity count — this store holds
  no inventory (dropship/arbitrage model). A breadcrumb links back to the
  product's category filter when it has one. The description supports
  markdown (bold, lists, links), not just plain text. Below the buy box,
  a "You might also like" row shows other products from the same category
  (falling back to the newest storewide products if the category is thin
  or the product has none), and a "Recently viewed" row shows the last few
  products the visitor looked at, remembered in their browser across
  visits. A reviews section shows the average rating and every approved
  review (rating, title, body, author display name, a "Verified purchase"
  badge when the reviewer has a paid order for the product); a logged-in
  visitor who hasn't already reviewed it can submit one (login required,
  one review per product), which stays hidden until an admin approves it.
- **Cart** (`/cart`) — line items showing the product's image, name, and
  price, a quantity stepper (persists immediately, no separate save step,
  capped at 99 per line) grouped with a trash-icon remove button, running
  subtotal, link to checkout. Guest carts live in a cookie and merge into
  the account cart on login/signup.
- **Checkout** (`/checkout`) — email (pre-filled for a logged-in customer)
  + shipping address + an optional promo code, server-side repricing
  (never trusts the cart's stored price), creates a unique BTC receive
  address for the order, redirects to a real bookmarkable order-status
  URL. Shows a subtotal/shipping/total summary before the customer
  submits; redirects back to the cart if it's empty. A logged-in customer
  can pick a saved address to autofill the form, or check a box to save
  the address they just entered. The address is checked before the order
  is created: the country has to be one the store ships to, a US address
  needs a real state, and the postal code has to match the country's
  format where that format is well known (US, CA, GB, AU, DE, FR) —
  elsewhere it just has to be present and a sane length, since inventing
  a pattern for an unchecked country would reject real addresses.
- **Coupons** — admin-managed percentage or fixed-amount discount codes,
  entered at checkout and validated/applied server-side (never trusted
  from the client) before the BTC quote is locked; a fixed amount is
  clamped so it can never exceed the order subtotal. The discount is
  snapshotted onto the order and shown on the order-status page — a later
  edit or deactivation of the coupon never alters an order that already
  used it.
- **Shipping** — a single flat-rate fee, admin-configurable, added once per
  order (not per item). Shown on product pages, the cart, and checkout, and
  snapshotted onto the order at placement so a later rate change never
  alters an existing order's total or the BTC amount already quoted for it.
- **Order status / confirmation** (`/orders/[id]`) — works for guests too
  (the order ID itself is the access key, same as the polling API). Shows
  payment/fulfillment status, line items, shipping address, tracking
  numbers, and a live-updating BTC payment panel: QR code, BIP21 URI,
  countdown to quote expiry, confirmation count, and clear messaging for
  underpaid or overpaid amounts. The panel stays put once payment settles
  or the window expires — it's where "Payment confirmed" and "this window
  expired, start again" are said, so it has to still be on screen at the
  moment either becomes true. A
  customer can cancel the order themselves any time before the chain has
  seen a payment (`pending`/`awaiting_payment`) — once BTC is in flight,
  cancellation is no longer offered. A "Reorder" button re-adds the
  order's items to the current cart, re-priced from the live catalog
  (skipping and reporting any item no longer available) — the way back
  if a cart got cleared by a since-expired or cancelled checkout. Each line
  item shows its own product thumbnail, and the shipping address sits in
  the same card right below the order total, so it's obvious at a glance
  what's being sent where.
- **Find my order** (`/orders/find`) — a guest who lost their order link
  enters the email used at checkout and gets the confirmation email(s)
  resent, each with a link back to the order. Doesn't reveal whether the
  email matched anything (same convention as password reset) and is
  rate-limited per IP+email. Linked from the footer, alongside a
  "Contact support" mailto: link (address set via `SUPPORT_EMAIL`) and
  Privacy Policy / Terms of Service pages (`/privacy`, `/terms` — currently
  placeholder copy, flagged as such on the page; swap in real policy text
  before going live).
- **Account** (`/account`) — profile, avatar upload, change password,
  change email (re-triggers verification), delete account (password
  confirmation required; past orders are kept but unlinked from the
  account); a banner + resend button while the email is unverified; a
  saved-address book (add, edit in place, delete, set default — used to autofill
  checkout); (`/account/orders`, `/account/orders/[id]`) — order history
  list and detail (same view as the guest order page, plus the login wall). Orders that are
  still pre-payment (`pending`/`awaiting_payment`) can be cancelled right
  from the list, not just the detail page — once BTC is in flight,
  cancellation is no longer offered anywhere.
- **Auth** (`/signup`, `/login`, `/forgot-password`, `/reset-password/[token]`,
  `/verify-email/[token]`) — email/password accounts, rate-limited login
  and signup. New passwords need at least 12 characters including a
  number and a symbol, or 24+ characters if you'd rather use a passphrase,
  in which case neither is required; the rule is shown on the form rather
  than only after a rejected submit. It applies wherever a password is
  set (signup, reset, change) but not at login, so accounts created under
  the old rule can still sign in. Password reset via emailed one-time token (doesn't reveal
  whether an email is registered), email verification via a similar
  emailed link (soft — unverified accounts can still log in and shop;
  it's just a reminder banner, not a login gate).
- **Emails** — welcome email (with open-tracking), verification email,
  order-confirmation email, payment-confirmed email. Sent via a
  console-log stub in dev/local; nothing is wired to a real provider yet.

## Admin (`/admin/*`, requires an admin account)

- **Dashboard** (`/admin`) — at-a-glance counts (unsourced order lines,
  supplier orders needing action, orders awaiting confirmation, recovered
  orders needing review), each linking to the relevant page, plus quick
  links to every admin section.
- **Suppliers** (`/admin/suppliers`) — full management, in the same table
  shape as the products page: one row per supplier (name, URL, status,
  notes, and what references it), with an "Edit" toggle opening a panel
  holding everything editable. Add a supplier from the toolbar; edit
  name/URL/notes; deactivate one that's gone out of business or had a URL go
  stale; delete one outright.
  Deactivating drops it out of "source from" pickers (new product, new
  supplier offer) without touching any existing offers or orders that
  already reference it — it stays selectable in admin filters/history.
  Deleting is offered only while nothing points at the supplier: any product
  offer or supplier order holding it makes the row say so (and how many)
  where the Delete button would be, since supplier orders are purchase
  history and are never deletable. Deactivating is the reversible option.
- **Categories** (`/admin/categories`) — categories are their own records,
  not a free-text field on the product. Create one, rename it, give it a
  description, merge one into another (every product moves, then the source
  is deleted, in one transaction), or delete it (its products become
  uncategorized — deleting a label never deletes what it labelled). A rename
  is a single write and every product in the category follows it; as a text
  column that was an update across the catalog that silently missed any row
  spelled differently, and a typo created a second category that looked
  identical in the table. The slug survives a rename on purpose, so existing
  `/products?category=…` links keep resolving — and that filter accepts
  either the slug or the display name.
- **Products** (`/admin/products`) — create a product and its preferred
  supplier offer in one form; import a batch of products from a supplier feed (URL, pasted
  JSON, or an uploaded spreadsheet); a "paste a product URL" helper that
  scrapes and prefills the add-product form; bulk publish/unpublish/
  delete/assign-category. The table lists one row per product — image,
  name, status, SKU, price and where it's sourced from — with an "Edit"
  toggle that opens a panel for that row (one at a time). The panel saves
  name, price, category and description together under a single "Save
  changes"; the slug is shown but never editable, so existing product
  URLs never break. Images and supplier offers sit alongside it with
  their own controls, since they're separate records: upload/manage
  product images, per-offer supplier-cost editing, add a further supplier
  offer to an existing product (e.g. once the original supplier goes out
  of stock) and switch which offer is preferred. Also bulk "apply X%
  markup" across the selected products; a "No supplier offer" badge on
  any product that could never actually be fulfilled; an editable category tag (free
  text) used by the storefront's category filter and assignable in bulk;
  filter the list by supplier.
- **Fulfillment** (`/admin/fulfillment`) — the ops queue of supplier
  orders (one per supplier per customer order), grouped by customer
  order. Mark a supplier order "ordered" (recording a reference) or
  "shipped" (recording a tracking number + carrier — USPS/UPS/FedEx/DHL,
  which turns into a clickable tracking link on the customer-facing order
  page); both are editable afterward if mistyped. Cancel a supplier
  order — once every supplier order on a customer order is cancelled, the
  order itself is marked cancelled automatically. Select several supplier
  orders on the same customer order and mark-ordered/mark-shipped/cancel
  them together with one shared reference or tracking number, instead of
  one row at a time. A banner surfaces any paid order line that couldn't
  be sourced (no supplier offer exists for that product) so it doesn't
  silently vanish, with a **"Retry sourcing"** action next to it: add the
  missing supplier offer, press it, and the order joins the fulfillment
  queue. Safe to press more than once — lines a supplier order already
  covers are never ordered again, and an order that is no longer paid is
  refused. Filter by status.
- **Orders** (`/admin/orders`) — every order in the store, searchable by
  customer email; (`/admin/orders/[id]`) — full detail (same view
  customers see) plus a "Mark refunded" action for orders that have
  already had a manual on-chain refund sent (refunds themselves are
  always a manual, out-of-band BTC send — this just records that it
  happened), a "Mark delivered" action once an order has shipped
  (there's no carrier webhook, so this is how delivery gets recorded),
  a free-text internal notes field for ops context (never shown to
  the customer), and a Timeline showing every payment/fulfillment status
  transition with a timestamp (tracking starts from when this feature
  shipped — orders placed before it have no history). A "Recovered"
  badge flags any order where a late
  on-chain payment arrived after the order had already been cancelled or
  expired — worth a manual look, since it's a rare edge case by design.
- **Reviews** (`/admin/reviews`) — moderation queue for storefront product
  reviews, defaulting to pending; approve (makes it public) or reject.
  Filter by status.
- **Coupons** (`/admin/coupons`) — create a percentage or fixed-amount
  discount code and activate/deactivate it. No editing an existing code's
  discount — deactivate and create a new one instead, so past orders that
  used it are never retroactively reinterpreted.
- **Users** (`/admin/users`) — look up an account by its exact email, see
  their profile and order history, promote them to admin or revoke an
  existing admin's access (an admin can't revoke their own). (Promoting
  the very first admin, before any admin account exists, is a one-time
  CLI step: `npm run admin:promote -- <email>`.) There's no
  browsing/searching across all customers yet — only exact-email lookup.
- **Settings** (`/admin/settings`) — the single global flat-rate shipping
  fee. Changing it only affects orders placed after the change; existing
  orders keep the rate they were placed under.
- **Audit log** (`/admin/audit-log`) — a durable, searchable-by-scrolling
  record of who did what and when, for the sensitive/destructive admin
  actions: refunds, admin promotions and demotions, product price
  changes, bulk markup, supplier-order cancellations and mark-ordered/
  mark-shipped (single and bulk), product deletions, manually failing a
  stuck order, and shipping-rate changes. Routine catalog edits (images,
  supplier-cost tweaks, etc.)
  aren't logged — this is a curated trail of the actions worth a
  who/when record, not a complete activity feed.
- **Analytics** (`/admin/analytics`) — best-effort, in-house event
  tracking (no third-party analytics tool, no data leaves the server).
  The dashboard covers revenue, traffic, top pages, referrers, searches
  and cart activity, over a window you choose: 7/30/90-day presets or a
  custom from/to range, with every panel and drill-down honouring the
  same window. On-chain: total BTC received and distinct addresses used,
  with a per-order table flagging any underpaid/overpaid orders — totals
  use each order's expected amount as a stand-in for actually-received
  sats (accurate in the common exact-payment case; no change to the live
  payment-confirmation path to get an exact figure).
- **Analytics drill-downs** — each headline links to a fuller page:
  `/admin/analytics/page-views` (per-page views, plus median time on page,
  measured by a beacon sent when the visitor leaves rather than by
  polling), `/admin/analytics/searches` (what people typed, and how often
  it returned nothing), `/admin/analytics/cart` (cart changes over time),
  and `/admin/analytics/on-chain` (settlement detail). Each exports the
  current range as CSV.
- **Where visitors are** (on the page-views drill-down) — a world map
  shaded by volume, with US states and cities when known, zoomable, plus
  country and city lists beside it. Locations are resolved from the
  visitor's IP against a database on the server (DB-IP Lite); no request
  leaves the machine and no third party is involved.
  Page views, searches, and cart changes are captured server-side
  (IP address and user-agent included) — this data is admin-only, never
  exposed to customers or third parties; worth a retention policy before
  going live with real traffic.

## Payments (non-custodial on-chain Bitcoin)

No card rails, no processor, no custody of funds — the server only ever
holds a watch-only public key.

- A unique receive address is derived per order (HD derivation from the
  account xpub) — never reused.
- Settlement is detected by polling the chain (no webhooks exist for
  on-chain BTC), on a repeating background job.
- Underpayment holds the order for manual review instead of auto-failing
  it; overpayment is flagged (for a manual refund of the difference)
  without holding up fulfillment. If it's never topped up, the order is
  automatically marked failed after 48 hours of sitting unresolved — an
  admin can also resolve one sooner from the order detail page.
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
