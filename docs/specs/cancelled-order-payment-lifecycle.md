# Spec: cancelled-order payment-lifecycle gaps

Two correctness gaps surfaced by a fresh functionality-gap audit after the
customer-initiated order-cancellation feature shipped (`cancelled` payment
status, PR #20). Both are direct analogues of things already fixed
elsewhere in this codebase — this doc exists so the fix is traceable to a
real spec rather than an ad-hoc patch.

## 1. A cancelled order's BTC payment intent goes stale

**Current state.** `BitcoinPaymentIntentStatus` is `'awaiting' | 'confirmed'
| 'expired'` (`src/modules/payments/application/ports/bitcoin-ports.ts:6`).
`CancelOrder` (`src/modules/orders/application/use-cases/cancel-order.ts`)
only flips `orders.paymentStatus` — nothing tells the intent's own `status`
column that the order was cancelled. It's bounded (the same
`PAYMENT_EXPIRY_GRACE_MS` window used everywhere else eventually drops it
out of `listWatchable()`, `drizzle-bitcoin-payment-store.ts:38-49`), but
until then the row reads `'awaiting'` — indistinguishable from a live
checkout in progress — and the chain-watcher keeps polling an address the
customer explicitly said they don't want.

**Fix.** Add `'cancelled'` to `BitcoinPaymentIntentStatus`. Add
`markCancelled(orderId): Promise<void>` to `BitcoinPaymentStore`
(`bitcoin-ports.ts`) and `DrizzleBitcoinPaymentStore`, mirroring the
existing `markExpired` exactly (`drizzle-bitcoin-payment-store.ts:58-63`).
`CancelOrder` gains a `BitcoinPaymentStore` constructor dependency and
calls `markCancelled(orderId)` right after a successful
`cancelOrder(orderId, userId)` — this belongs inside the use case (not
orchestrated at the action layer) because it's part of what "cancel this
order" correctly means, the same way `ConfirmPayment` owns its own
follow-on consequences rather than delegating them to the caller. A no-op
if the order never reached `awaiting_payment` (no intent row exists yet).

**Acceptance:** cancelling an order that has an in-flight BTC intent flips
that intent's `status` to `'cancelled'` in the same operation; it
immediately drops out of `listWatchable()` rather than waiting out the
natural TTL.

Out of scope: `markExpired` is itself never invoked anywhere in the
codebase today (a pre-existing, separate gap on the expiry side, not
introduced by cancellation) — not fixed here, since it wasn't part of what
was asked.

## 2. No admin-visible record of a `cancelled → paid` / `expired → paid` recovery

**Current state.** `order-status.ts`'s narrow recovery paths
(`expired: ['paid']`, `cancelled: ['paid']`) exist specifically so a
late-arriving on-chain payment to an already-derived address is never
stranded. `ConfirmPayment` (`confirm-payment.ts:46-63`) only emits a
`logger.warn(...)` when this happens — there is no durable, admin-visible
trace. Contrast with unfulfillable order lines
(`orderLines.fulfillmentIssue`,
`list-unfulfillable-order-lines.ts`) — the established pattern in this
codebase for exactly this shape of problem ("a rare thing happened that an
admin should actually be able to find and follow up on, not just grep
logs for").

**Fix.** Add `orders.payment_recovered_from: text` (nullable; values
`'expired' | 'cancelled'`). `ConfirmPaymentOrderRepository`
(`order-repository.ts:8-11`) gains
`recordPaymentRecovery(orderId, from: 'expired' | 'cancelled'): Promise<void>`.
`ConfirmPayment` calls it right where the existing `logger.warn` already
fires for each branch, so the log line and the durable record are set
together, not just one or the other. `OrderListItem`/`OrderDetail`
(`order-history-repository.ts`) gain
`paymentRecoveredFrom: 'expired' | 'cancelled' | null`. Unlike
unfulfillable lines, no new admin page is needed — `/admin/orders` and
`/admin/orders/[id]` already exist (they didn't when the unfulfillable-lines
pattern was built); add a badge ("Recovered from cancelled" /
"Recovered from expired") to both.

**Acceptance:** a `cancelled → paid` or `expired → paid` recovery is
visible on the admin orders list and detail page without needing to read
logs, and the existing log line still fires unchanged.

## Verification

- TDD: `CancelOrder`'s new fake `BitcoinPaymentStore` dependency
  (asserts `markCancelled` is called with the right orderId, and is a
  no-op when no intent exists); `ConfirmPayment`'s existing recovery-path
  tests extended to assert `recordPaymentRecovery` is called.
- `npm run typecheck && npm run lint && npm test`, plus the zero-env-var
  pass.
- `npm run db:generate` for the new `orders.payment_recovered_from`
  column → review → `npm run db:migrate`.
- Live DB pass via the DI container: place an order, start checkout (real
  intent row), cancel it, confirm the intent's `status` is `'cancelled'`
  and it's absent from `listWatchable()`; separately, drive an order
  through `cancelled → paid` via `ConfirmPayment` and confirm
  `payment_recovered_from = 'cancelled'` persists and shows up via the
  admin order-detail read path.
