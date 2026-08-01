# Order → payment → fulfillment review

Read against the code on 2026-07-31, not against `docs/features.md`. Every
finding cites the file it came from. Ordered by what can cost real money, then
by what leaves a customer without an answer, then by everything else.

## What holds up

Worth stating first, because the list below is all problems and would give a
misleading impression on its own. These are not assumptions — each was checked:

- **`paid` has exactly one writer.** `ConfirmPayment` is the only caller of
  `setPaymentStatus('paid')`, driven by the watcher. The state machine
  (`order-status.ts`) guards every transition and the illegal ones throw.
- **The watcher is genuinely re-entrant.** `ConfirmPayment` de-dupes on event
  id *and* on current status, and `CreateSupplierOrdersForPaidOrder` only ever
  sees lines no supplier order covers, so a repeated pass cannot double-order.
- **"Nothing yet" is distinguished from "short".** `watch-bitcoin-payments.ts`
  guards on `confirmedSats > 0` before computing `underpaid`, which is what
  stops every unpaid order looking underpaid on its first pass — and being
  pushed out of reach of expiry and the customer's cancel button.
- **A cancelled supplier order doesn't wedge the parent.**
  `allShippedForOrder` excludes cancelled rows, so one cancelled parcel can't
  stop an order reaching `shipped`.
- **The two clocks are correct.** `listWatchable` keys off the *order*
  deadline, not the quote's, so a lapsed quote doesn't stop the address being
  watched. `RefreshPaymentQuote` re-quotes the same address, so a scanned QR is
  never orphaned.
- **Sourcing refuses to spend on an unpaid order**, re-checked at the top of
  `CreateSupplierOrdersForPaidOrder` because an admin can retry it by hand.

## 1. A paid order can be stranded with nothing ordered — FIXED

`confirm-payment.ts:60-83`. The sequence is:

```
setPaymentStatus(orderId, 'paid')   // committed
await fulfillment.enqueueOrderPaid(orderId)   // throws if Redis is down
...
processedEvents.markSeen(eventId)   // never reached
```

If the enqueue throws, the order is already `paid` and the event is *not*
marked seen. The next watcher pass re-enters, finds `status === 'paid'`, marks
the event seen and returns early — so **the enqueue is never retried**. The
order is paid, no supplier order exists, and the only recovery is an admin
noticing the line in `/admin/fulfillment` and pressing "retry sourcing".

Redis being unavailable is exactly the condition that makes the enqueue fail,
so this is not an exotic scenario. It is silent, permanent, and on the money
path.

**Fixed** by making `markSeen` mean "every side effect completed". The
`status === 'paid'` early return is gone: an *unseen* event id is precisely the
evidence that a previous attempt didn't finish, so the remaining work is
completed rather than skipped, and the enqueue is deliberately left outside
try/catch so a failure keeps the event unfinished for the next pass.

**Also fixed:** the narrower case where the enqueue *succeeded* and the job was
later lost (Redis wiped, or a queue drained by hand).
`ReconcileUnsourcedPaidOrders` runs every watcher pass and re-enqueues any
`paid` order holding a line that no supplier order covers **and** that carries
no fulfillment issue — the second condition being what separates "work went
missing" from "known unsourceable, already in the admin queue". Orders idle for
less than fifteen minutes are left alone so the pass doesn't race the job it's
backstopping.

That state was previously invisible from every angle: the event was marked
seen, the order looked normal, and unflagged lines don't appear in the admin's
unsourced queue. This reconciler is now the only thing that would ever notice.

## 2. A payment arriving after the deadline is invisible — FIXED

`drizzle-bitcoin-payment-store.ts:65-87`. `listWatchable` requires
`status = 'awaiting'` **and** `orders.paymentDeadlineAt > now − grace`. Once
`ExpireStaleCheckouts` has run, the intent is `expired` and the order is
`expired`, so that address is never polled again.

A customer who pays at hour 25 sends real bitcoin to a real address that
nobody is watching. Nothing detects it. It won't appear in the on-chain report
either, because `GetOnChainActivityReport` lists only orders with
`paymentStatus = 'paid'` (`get-on-chain-activity-report.ts:19-21`).

The 24-hour window is a deliberate business rule and shouldn't change. The
problem is that expiry currently means *stop looking*, when it should mean
*stop promising*.

**Fixed** by `SweepLatePayments`, hourly, over intents `expired` *or*
`cancelled` within the last 30 days. Anything holding coins is recorded on the
intent (`late_payment_sats`, write-once) and surfaced as the first tile on the
admin dashboard, above unsettled payments.

It deliberately does not confirm the payment or move the order — see finding 4;
resurrecting a closed order because coins arrived would decide that by accident.

**`cancelled` turned out to matter as much as `expired`.** `markCancelled` also
drops an intent out of `listWatchable`, so the state machine's `cancelled ->
paid` recovery path — which exists precisely for "they cancelled but paid
anyway" — had nothing that could ever reach it. The same sweep covers both.

## 3. The amount actually received is never stored — FIXED

`ConfirmPayment` accepts `confirmedSats` (`confirm-payment.ts:19`) and **never
reads it**. The watcher computes the real figure and discards it;
`GetOnChainActivityReport` admits this in its own doc comment and substitutes
`expectedSats` as a proxy for revenue.

For an exact payment that's harmless. For an underpaid or overpaid one, the
business has no record of what actually arrived — which is the only number
that matters when deciding what to do about it. It also means the revenue
figure is quietly wrong for exactly the orders where accuracy matters most.

**Fixed.** `bitcoin_payment_intents.confirmed_sats` (0030) is written by the
watcher's existing `recordProgress` call, on every pass and in every branch, so
there's one writer and no way for two records to disagree. The revenue report
totals it and falls back to `expectedSats` only for rows confirmed before the
column existed — a paid order cannot genuinely have received 0 sats, so 0 is an
unambiguous "not recorded". The admin ledger and CSV export show received and
expected side by side, since a discrepancy is unreadable with only one figure.

`ConfirmPayment`'s `confirmedSats` parameter is **gone** rather than wired up.
It was accepted and never read, which made it look as though something recorded
the amount when nothing did; the watcher already persists it before
`ConfirmPayment` runs, so a second writer would only add a way to disagree.

## 4. Underpayment has no ending — FIXED

Today: the watcher flags `underpaid` and moves the order to
`awaiting_confirmation`; it sits there; after 48 hours
`FailStuckAwaitingConfirmationOrders` moves it to `failed`.

At that point the customer has sent real bitcoin, the order is dead, nothing
ships, no record exists of how much arrived (finding 3), and **no email is
ever sent** (finding 6). Removing refunds removes the only mechanism the app
nominally had for resolving it.

**Decided 2026-07-31: top-up against the same address.** The order stays open
and the customer is told what's still owed. It fits the existing model — the
address is already stable across re-quotes, which is exactly what makes a
top-up possible — and it's the only option that ends with a paid order and a
customer who got what they bought.

The options as they were weighed:

- **Top-up.** The order stays open and the customer is told what's still
  owed against the same address. Fits the existing model — the address is
  already stable across re-quotes — and is the only option that ends with a
  happy customer.
- **Goodwill fulfil** below a threshold, treating small shortfalls as dust.
- **Hold for manual resolution**, but record the shortfall and notify the
  customer, so it's a conversation rather than silence.

Doing nothing was the behaviour at the time of writing, and the one option that
guaranteed a complaint with no data to answer it. Finding 3 is now in place, so
the shortfall is a real number the top-up flow can quote.

## 5. Overpayment is flagged and then ignored

`watch-bitcoin-payments.ts:39-45` records `overpaid` and — correctly — lets
fulfillment proceed. But the excess is never quantified (finding 3) and never
surfaced beyond a boolean on an admin row. With refunds gone there is no
mechanism to return it and no record that there is anything to return.

At minimum the excess should be recorded and visible. Whether anything is
*done* about it is the same product decision as finding 4.

## 6. Four lifecycle events tell the customer nothing

Only three order emails exist: confirmation (at placement), payment confirmed,
and per-parcel tracking. Nothing is sent when an order becomes:

- **`expired`** — someone who wandered off is never told their order lapsed,
  or that re-ordering is the way back.
- **`failed`** — including the underpaid case above. This is the worst one:
  they sent money and hear nothing, ever.
- **`cancelled` by an admin** — the customer isn't told (self-cancellation is
  fine, they did it).
- **`delivered`** — the terminal state closes the loop for the shop and not
  for the customer.

`expired` and `failed` are the two that generate support mail. The templates
are cheap now that `EmailLayout` exists.

## 7. Removing refunds

Per decision on 2026-07-31, refunds are not part of the product. This is
removal work, not a fix, and it touches:

- `PaymentStatus`'s `refunded` member and `paid: ['refunded']` →
  `paid: []` in `order-status.ts`
- `MarkOrderRefunded` + its test, the container wiring, `markOrderRefundedAction`,
  and `RefundOrderButton.tsx`
- the `order.refunded` audit action
- `isOrderContactEditable`'s `refunded` early return (`order-status.ts`)
- `status-tone.ts`'s handling of the status, and any admin filter offering it
- `CreateSupplierOrdersForPaidOrder`'s comment listing "refunded" as a
  not-paid case, and `MarkOrderDelivered`'s "Mirrors `MarkOrderRefunded`'s
  shape"
- `CLAUDE.md` (the refunds bullet under Bitcoin payments, and the sudo-mode
  list naming refund) and `docs/features.md`

**Check before deleting:** whether any order in the live database is already
`refunded`. If so the column value needs migrating, not just the type.
`paid` becoming terminal also means an order that *was* refunded out-of-band
has nowhere to say so — if that ever needs recording, an ops note on the order
is the place, and that already exists.

## 8. Smaller things

- **`DUST_TOLERANCE_SATS = 1000` is hardcoded** (`watch-bitcoin-payments.ts:12`).
  It's the threshold that decides underpaid and overpaid, and at $100k/BTC it's
  about a dollar. It belongs in `env.ts` with the other BTC settings.
- **`CreateSupplierOrdersForPaidOrder` returns early on `lines.length === 0`**
  before the block that advances fulfillment to `processing`, so a re-run
  against a fully-sourced order can leave the status behind. Narrow, but the
  early return is placed for a dev-harness case and has a real side effect.
- **`getByOrderId` doesn't filter by status**
  (`drizzle-bitcoin-payment-store.ts:57-62`), so `createPayment`'s idempotency
  check would happily return an `expired` or `cancelled` intent and hand back a
  dead quote. Not reachable today — checkout creates a fresh order each time —
  but it's loaded, and nothing in the signature says so.
- **The watcher polls serially**, one Esplora call per open order per pass. Fine
  now; at volume the pass will outgrow the 45-second interval, and the fix
  (batching or concurrency) wants thinking about before it's urgent rather
  than after.
- **No delivery signal exists** beyond an admin pressing a button — no carrier
  webhook, so `delivered` is only as accurate as someone remembering.

## Suggested order of work

1. Findings 1 and 2 — both are silent, permanent, money-losing, and neither
   needs a product decision.
2. Finding 3 — small, and findings 4 and 5 depend on having the number.
3. Finding 7 — removing refunds, since it simplifies the state machine that
   the rest of this work touches.
4. Finding 6's `expired` and `failed` emails.
5. Findings 4 and 5, once the top-up-vs-hold decision is made.
6. Finding 8, opportunistically.


---

## Addendum, 2026-07-31: clearing stuck orders

Raised while finding 4 was being built: is anything un-clearable? Checked, and
mostly no — but one case was, and it was the worst kind.

**Already handled automatically.** Never-paid orders expire at the 24-hour
deadline (`ExpireStaleCheckouts`, which covers `pending` and `awaiting_payment`).
A part-payment that never completes fails at 48 hours
(`FailStuckAwaitingConfirmationOrders`, measured from when money was first seen,
independent of the order window).

**Already possible but unreachable.** `FailOrder` always permitted `failed` from
all three pre-payment statuses, but `FailOrderButton` rendered only for
`awaiting_confirmation` — so an admin looking at an unpaid order had nothing to
click and had to wait out the timers. Now offered for all three.

**Genuinely un-clearable, now fixed.** A paid order that can't be fulfilled had
no exit at all. `paid` has no onward payment transition, and the only code that
set fulfillment `cancelled` required *all* supplier orders cancelled — of which
there were none, since `allCancelledForOrder` returns false for an empty set.
`CancelOrderFulfillment` closes it, and also handles a parcel lost in transit,
which previously could only ever become `delivered`.

**What it deliberately doesn't do:** touch payment status. A paid order stays
paid. Rewriting it to `failed` would corrupt revenue reporting and destroy the
evidence that money is owed to someone — and with no refund mechanism, that
evidence is all there is. The customer is not emailed automatically either; that
decision is left explicit rather than buried in a form submit.

**Still open from this addendum:** a paid, cancelled order means a customer has
paid for nothing. Nothing notifies them, and there's no in-app way to make them
whole. That's the same open question as finding 5, not a new one.
