# Pre-deploy audit — 2026-07-31

Four parallel audits of the money path, plus the first live-infrastructure
probe this app has ever had. Read against the code at `f7345b3`.

**Deployment verdict: not yet.** Three confirmed defects charge the wrong
amount or produce an unpayable order. None is deep — all are narrow fixes —
but each one costs a real customer real money that cannot be returned, because
there is no refund mechanism.

## What was checked live, for the first time

Every previous claim about chain behaviour in this repo rested on `FakeChain`.
These went to real infrastructure:

- **Live rate feed** (`MempoolRateProvider` → mempool.space): returned
  BTC/USD ≈ 62,912, parsed clean through the Zod schema. The float is correctly
  confined to the rate itself; the sats conversion comes out integer.
- **Live Esplora, testnet** (`EsploraChainDataProvider`): parsed a genuinely
  funded address pulled from the chain tip — 1000 sats, 1 confirmation, both
  integers. Non-empty UTXO responses parse correctly against real data, not
  just fixtures.
- **Our own address validation** rejected an address invented for the probe,
  which is the correct behaviour and worth recording as a positive.

Still untested against real infrastructure: an end-to-end testnet payment
(deriving an address from a real xpub, sending real testnet coin, watching it
confirm). That is the last gap before mainnet is a reasonable conversation.

## Confirmed defects, ordered by what they cost

### 1. The checkout page shows a price the customer may not be charged

`src/app/(storefront)/checkout/page.tsx:81` renders `line.unitPrice` — the
price snapshotted at add-to-cart. `PlaceOrder` re-reads the live catalogue and
mints the order at the **current** price.

`RepriceCart` exists, has a `staleProductIds` output built for exactly this
problem, is constructed at `container.ts:501`, and **is called from nowhere.**

So: add a $50 item, admin edits it to $500, reload checkout — the page still
says $50, the customer authorises $50, and the BIP21 QR encodes sats for $500.
Irreversibly, with no price-change notice anywhere.

The *authority* side is correct and CLAUDE.md's "re-price at checkout" rule is
honoured. What's broken is **disclosure**. Fix: call `RepriceCart` on the cart
and checkout pages and surface `staleProductIds` before the customer commits.

### 2. An admin line edit can drive the total negative

`src/modules/orders/application/use-cases/edit-order-lines.ts:161`

`orderTotal` re-adds the lines but keeps the discount snapshot un-reclamped,
and `Money.of` permits negatives.

2 × $25.00 = 5000, fixed $50 coupon (clamped to 5000 at place-order),
shipping 500 → total 500. Admin drops the quantity to 1: subtotal 2500,
total = 2500 + 500 − 5000 = **−2000**. That persists, and at 1666.67 sats/USD
gives `expected_sats = −33333` and `bitcoin:…?amount=-0.00033333` — a URI no
wallet can pay, so the order can never settle. A 100% percentage coupon reaches
the same state.

**Needs a decision:** re-clamp the discount to the new subtotal, or refuse the
edit outright.

### 3. Bulk markup has no lower bound

`src/app/actions/admin/catalog.ts:621` + `apply-markup-to-products.ts:40`

`markupPercent` is a bare `z.coerce.number()`, `updatePrice` writes it raw, and
`Product` carries no price invariant. `−100` — a plausible "undo the markup"
typo — makes every selected product free. `−150` makes prices negative, which
feeds the same negative-sats path as #2. The single-product editor rejects
≤ 0; this path doesn't.

### 4. A zero total is reachable with no admin action at all

Fixed coupon ≥ subtotal is clamped to the subtotal, and shipping defaults to 0
when no rate row exists → total 0 → `expected_sats = 0`. The watcher's
`seen = confirmedSats > 0` never fires, so the order sits in
`awaiting_payment` until expiry — having burned an address index against the
wallet's BIP32 gap limit. Nothing in `StartCheckout` short-circuits a zero
total.

### 5. Cart writes are non-atomic

`src/modules/cart/infrastructure/redis-cart-repository.ts:52-102` is a plain
`GET` then `SET` — no WATCH, no version, no Lua — and every use case does
get → mutate → save.

Two tabs adding different items within one round-trip: the second write wins
and an item silently disappears. The same shape lets a double-submitted
checkout mint **two orders and two BTC addresses from one cart** — nothing
spans the two calls but a 10/hour IP rate limit.

### 6. The admin contact editor bypasses every address validator

`src/app/actions/admin/orders.ts:324` uses bare `z.string().min(1)` — no
country list, no postal pattern, no `refineAddress`. `country: "Narnia"`,
`region: "ZZ"`, `postalCode: "-"` all persist to the order's address snapshot.
The Country field in the form is free text, so `"United Kingdom"` instead of
`"GB"` is a one-keystroke divergence from the stored convention.

`update-order-contact.ts:28` claims "an admin can't write an order an address
that checkout would have rejected". **That comment is false.**

### 7. US territories cannot check out

`US_STATES` is 50 states + DC. A Puerto Rico customer (`PR`, ZIP `00901`) is
rejected with "Choose a US state", and `PR` isn't in the country list either,
so there is no path at all. Same for `VI`, `GU`, and APO/FPO military
addresses (`AE`/`AP`).

**Needs a decision:** do you ship to US territories?

### 8. Smaller, confirmed

- **`GIR 0AA`** — the one genuinely irregular UK postcode — is rejected
  (`postal-code.ts:19`).
- **Canadian postcodes don't exclude the forbidden letters** D, F, I, O, Q, U:
  `D1F 1I1` is accepted (`postal-code.ts:17`).
- **A saved address stores `region` un-normalised.** `"tx"` is validated and
  stored raw; autofill then sets `<select value="tx">`, which matches no
  option, so the field submits empty and checkout fails with a generic error.
  The saved address is silently unusable.
- **Whitespace-only passes Zod** (`min(1)`), then `ShippingAddress.create`
  throws *inside* `PlaceOrder` — a 500 rather than a field error.
- **No maximum length on any address field**, all backed by `text`/`jsonb`.
- **The stored cart is cast, not parsed** — violating the repo's own
  "parse, don't cast" rule. A corrupt quantity wedges every cart page at 500,
  and because remove-from-cart also reads it, the customer can't clear it.
- **Merge-on-login can double quantities** if the guest-cart delete fails: the
  guest cookie is never rotated at login, so a second login re-merges.
- **Coupon currency is never checked** (`coupon.ts:84`) — latent only because
  the admin form hardcodes USD.

## Verified sound

Recorded because knowing what was cleared matters as much as the defect list:

- The empty-guest-cart-key leak is defended three layers deep; no path yields
  `cart:guest:`.
- No cart action accepts an owner, cart id, or price from the client.
- Quantity bounds hold at every entry point — add, update, reorder, merge —
  including 0, negative, fractional and absurd values.
- `Money` add/subtract/multiply are integer-only with currency assertions, and
  `multiply` rejects a fractional factor.
- Percentage-coupon maths is integer-only; the half-cent rounds to the
  customer; ≤100% cannot exceed the subtotal.
- Displayed, persisted and quoted totals agree on every path **except** the
  negative one in #2.
- Five of the six postal patterns are correct, including ZIP+4 and every
  short-form UK postcode.
- The 0028 `sku` → `productName` cart fallback is correct, and no other cart
  path still assumes the old shape.
- A product leaving the catalogue mid-session degrades gracefully everywhere.

## Not done

**An independent review of this session's own payment work never completed** —
the agent failed twice, once on a connection error and once on a session limit.
That work (the top-up flow, the late-payment sweep, the sourcing reconciler,
persisting confirmed sats, refund removal, admin cancel-fulfillment) has still
been reviewed only by its author. Three of its bugs were already found to be
*interactions between separate changes*, so a second pair of eyes on it is the
single highest-value thing still outstanding.

Also not done: driving the actual UI in a browser. The dev server runs and
serves pages, but no one has watched the top-up panel render or a status badge
update after a payment lands.
