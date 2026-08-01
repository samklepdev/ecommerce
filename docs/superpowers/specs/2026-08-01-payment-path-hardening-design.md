# Payment-path hardening

**Date:** 2026-08-01
**Status:** approved, in progress
**Scope:** four branches, sequential, each its own PR

## Why

A five-agent audit of the checkout → order → settlement path found several ways a
customer's bitcoin is destroyed and one way the shop's revenue figure is simply wrong.
Three of the five agents independently ranked the same defect first, which is what
decided the ordering below.

The findings this spec addresses, in severity order:

1. **Re-quoting reprices a payment already in flight.** `RefreshPaymentQuote` gates on
   `paymentStatus` and `reprice` gates on intent status `awaiting`. Neither looks at the
   address. `aggregateChainStatus` counts only *confirmed* transactions, so a customer who
   broadcast 60 seconds ago is still `awaiting_payment` — and at minute 15 the widget
   declares the quote lapsed and offers a **"Get today's price"** button. Clicking it
   rewrites `expectedSats`; if BTC moved down, their full payment becomes an underpayment,
   they are emailed a demand for a balance they do not owe, and at 48 hours the order goes
   `failed` — terminal, unrefundable.
2. **Dust resets the confirmation clock.** `confirmations` is `Math.min` across *every*
   transaction paying the address. The address is public the moment the customer pays, so
   546 sats per block holds any order below the threshold indefinitely, until the 48-hour
   window fails it and keeps the money.
3. **A payment broadcast near the deadline expires under the customer.** Mempool value
   contributes nothing, so the order stays `awaiting_payment` — the one status
   `findExpiredAwaitingOrderIds` expires — while a low-fee transaction waits for a block.
4. **Late money can never be credited.** `listWatchable` excludes closed orders and
   `ConfirmPayment` has exactly one caller (the watcher), so the `expired → paid` and
   `cancelled → paid` edges in the transition table are unreachable. Recovery today means
   hand-written SQL.
5. **Revenue counts every order ever placed.** `getDailyRevenue` sums `order_created`
   events with no payment-status predicate, and `paidAt` is aliased to `orders.updatedAt`
   (there is no `paid_at` column), which shipping rewrites — so paid orders also migrate
   between reporting periods.
6. **The admin cannot see any of it.** `/admin/orders/[id]` passes `paymentSession={null}`,
   so no address, expected, confirmed, shortfall or confirmation count is visible on any
   order, and the late-payment tile is a bare `COUNT(*)` with no drill-down.
7. **Nothing sanity-checks the BTC price.** `parseBtcPrice` validates shape only. A feed
   returning `{"USD": 1}` quotes ~50 BTC invoices; the inverse ships goods for 50 sats.

## Approved policy decisions

These were product calls, not code calls, and were taken before design:

- **An unconfirmed payment holds the order open** and blocks re-quoting.
- **An admin can credit a late payment**, via a sudo-gated action that makes the
  `expired → paid` / `cancelled → paid` edges reachable.
- **A suspect rate refuses to quote** rather than quoting from a bad number.
- **The customer is warned before the 48-hour deadline** that ends a part-paid order.

## Branch 1 — `fix/payment-in-flight`

### 1a. Chain status becomes mempool-aware

`AddressChainStatus` gains `pendingSats: number` — the sum of outputs paying the address
in *unconfirmed* transactions. `confirmedSats` keeps its exact current meaning; nothing
that decides settlement changes definition.

### 1b. Confirmation depth is measured over the payment, not over the address

`aggregateChainStatus` takes `expectedSats` and computes depth only across the **oldest
set of confirmed transactions that covers `expectedSats`**, ascending by block height,
rather than `Math.min` over every transaction touching the address.

Dust arriving *after* the real payment falls outside that prefix and cannot reduce the
minimum. Dust arriving *before* it is inside the prefix but is deeper, so it cannot reduce
the minimum either. When the confirmed total never reaches `expectedSats`, depth is the
minimum across all contributing transactions, as today — the order is underpaid regardless,
so depth is not what gates it.

This changes the port: `getStatus(address, expectedSats)`. Both callers — the watcher and
`SweepLatePayments` — already hold the intent.

### 1c. Seen-but-unconfirmed holds the order open

In `WatchBitcoinPayments`, `seen` becomes `confirmedSats + pendingSats > 0`, which moves
the order to `awaiting_confirmation`. That status is excluded from
`findExpiredAwaitingOrderIds` and retained by `listWatchable`, so the order stops expiring
under an in-flight payment, and `RefreshPaymentQuote`'s existing status guard starts
refusing the re-quote — one change closing three findings.

**The trap this must not fall into.** Making `seen` true on mempool value alone would make
`underpaid` (`seen && confirmedSats < expected − dust`) fire with *zero* confirmed sats,
emailing a balance demand to a customer who has paid in full and is waiting for a block —
the original bug, re-created. The predicates therefore split:

```
seenSats           = confirmedSats + pendingSats
seen               = seenSats > 0                          // holds the order open
underpaid          = seen && seenSats < expected − dust     // only this nags the customer
shortOfExpected    = confirmedSats < expected − dust        // gates settlement, confirmed only
overpaid           = confirmedSats > expected + dust        // a settled fact, confirmed only
```

Settlement requires `!shortOfExpected && confirmations >= required`. The explicit
`shortOfExpected` gate is load-bearing: with `underpaid` now counting pending value, it is
the only thing preventing an order with 50k confirmed and 50k pending against 100k expected
from being marked `paid` on the confirmed transaction's depth.

`NotifyUnderpaidOnce` is quoted against `seenSats`, so a customer part-way through paying is
never asked for money that is already in the mempool. It keys on the amount, so if a pending
transaction is dropped the next pass re-notifies with the corrected figure.

### 1d. Repricing refuses against a funded address

`OnChainBitcoinPaymentGateway.repricePayment` reads live chain status and refuses when the
address holds any value, confirmed or pending. `RefreshPaymentQuote` surfaces this as a new
`payment_in_flight` error.

1c already closes most of this window, but not all of it: a customer can broadcast and
re-quote inside one 45-second watcher interval. This check closes it completely, at the cost
of one Esplora call per re-quote — which is user-initiated and rare.

The customer-facing copy on a lapsed quote changes accordingly: when a payment is visible,
the widget must say so and suppress the re-quote button rather than inviting a second
payment.

### 1e. Persistence

Migration `0032_pending_sats.sql` adds `pending_sats integer not null default 0` to
`bitcoin_payment_intents`, written by `recordProgress` on every pass. It feeds the customer
widget, and the admin panel in branch 3.

`_journal.json`'s `when` for 0032 must exceed 0031's — a test enforces this, and a
low-stamped migration is skipped *silently* on an existing database.

## Branch 2 — `fix/no-stranded-orders`

- **Stamp `paymentDeadlineAt` at order creation.** It is NULL until `markAwaitingPayment`,
  and `findExpiredAwaitingOrderIds` filters with `lt()`, which NULL never matches — so an
  order whose gateway call failed sits `pending` forever. Fixing this activates a latent
  bug: `listWatchable` includes `pending`, `MarkAwaitingConfirmation` no-ops for it, and
  `PAYMENT_TRANSITIONS` has no `pending → paid`, so a payment against a `pending` order
  would throw on every pass. Both are fixed together.
- **Recover a failed checkout.** `placeOrder` deletes the cart before `startCheckout` runs,
  so a gateway failure loses the cart *and* hides the order id. Return the order id on
  failure and redirect to `/orders/<id>`, which offers a resume-payment action.
- **Admin can credit a late payment** — sudo-gated, calling `ConfirmPayment`, making the
  transition table's existing recovery edges reachable.
- **`ExpireStaleCheckouts` honours `tryExpire`'s boolean** before marking the intent expired;
  today it can mark an intent `expired` for an order it did not expire, which removes it
  from watching while the order stays open and still invites a top-up.
- **`markAwaitingPayment` gets compare-and-set**, the one payment-status write without it.
- **Warn before the 48-hour deadline** (approved policy): state it in the underpaid email
  and on the order page, and send a reminder before the window lapses. Today the email says
  the amount "won't move while you finish paying" with no time limit at all.

## Branch 3 — `fix/revenue-truth`

- **`paid_at` column**, set once on the transition to `paid`, backfilled from the
  `payment_status_changed` order event. Revenue and the on-chain report bucket on it.
- **Revenue filters to paid orders** and the metric is relabelled.
- **Admin order page renders the BTC intent**: address, expected, confirmed, pending,
  shortfall, confirmations, late-payment flag.
- **Late-payment drill-down** (`listLatePayments`) behind the dashboard tile, and
  payment/fulfillment status filters on the admin order list, which the tiles link to.
- **Correct the on-chain page's note**, which currently claims totals use expected sats and
  exclude flagged orders; the code does the opposite.

## Branch 4 — `fix/rate-sanity`

Refuse to quote when the rate deviates beyond a band from last-known-good (persisted in
Redis so it survives a restart), or falls outside a coarse absolute plausibility range that
catches a decimal shift on first run when there is no last-known-good. Add fetch timeouts.

## Testing

Domain and use-case changes are driven test-first and must run under `npm test` with no
database or network. The confirmation-depth prefix logic, the four watcher predicates, and
the reprice refusal are all pure enough to test directly.

`pending_sats` persistence and the `paid_at` backfill need
`*.integration.test.ts` — a fake repository is a second implementation of the rule and
cannot disagree with itself.

## Out of scope

Deliberately deferred, and still open after this work: fulfillment-status writes have no
compare-and-set; cancelling an order leaves its supplier orders live in the queue;
`allShippedForOrder` can advance an order with an unsourced line; Esplora responses are
never paginated past 25 transactions; there are no fetch timeouts on the chain provider;
the address index is consumed before the rate call; coupons have no expiry or redemption
limit; cart writes are read-modify-write; and the payment-confirmed email tells the customer
"We order from our supplier next."
