-- When the order was actually paid, recorded once and never moved.
--
-- Two reports needed this and neither had it.
--
-- The on-chain activity report aliased `paidAt: orders.updated_at`, and
-- `updated_at` is rewritten by shipping, cancelling, editing lines, updating
-- contact details and recording a payment recovery. So an order settled on
-- 5 January and shipped on 10 February moved out of January's report and into
-- February's — the sats were not missing, they were filed under the wrong
-- month, and any order still moving through fulfillment was effectively
-- invisible in the period it was actually paid in.
--
-- The revenue summary had the opposite problem: it bucketed on the
-- `order_created` event and filtered on nothing at all, so every abandoned
-- checkout, expired, cancelled and failed order was booked as revenue. On a
-- non-custodial Bitcoin store, where abandonment is the norm, that is not a
-- rounding error.
--
-- Nullable on purpose: only a paid order has a paid-at, and NULL says so
-- honestly. The backfill below fills it for every order already paid.

ALTER TABLE "orders" ADD COLUMN "paid_at" timestamptz;

-- Backfilled from the durable record rather than guessed: `order_events` has
-- carried a `payment_status_changed` row with status `paid` since the table
-- existed, and its `created_at` is immutable. MIN() because the recovery paths
-- (expired -> paid, cancelled -> paid) can write a second one, and the first
-- time an order was paid is the one that counts.
--
-- COALESCE to `updated_at` for any paid order with no such event — there
-- should be none, but a report silently dropping orders is worse than one
-- using a less precise timestamp for a handful of historical rows.
UPDATE "orders" o
SET "paid_at" = COALESCE(
  (
    SELECT MIN(e."created_at")
    FROM "order_events" e
    WHERE e."order_id" = o."id"
      AND e."event_type" = 'payment_status_changed'
      AND e."status" = 'paid'
  ),
  o."updated_at"
)
WHERE o."payment_status" = 'paid';

-- Both reports scan this by range on paid orders.
CREATE INDEX "orders_paid_at_idx" ON "orders" ("payment_status", "paid_at");
