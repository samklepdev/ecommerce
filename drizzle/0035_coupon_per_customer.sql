-- Per-customer coupon limits.
--
-- `max_redemptions` caps a code globally, which stops a leaked code being used
-- a thousand times but does nothing about one person using it a hundred. A
-- "one per customer" welcome code had no way to say so.
--
-- The count lives in its own table rather than as a column, because a column
-- cannot be made atomic: two concurrent checkouts both read "0 used" and both
-- proceed, which is the whole thing a limit is for. Each redemption claims an
-- explicit slot — 0, then 1, then 2 — and `(coupon_id, customer_key, slot)` is
-- unique, so two orders racing for the same slot collide on the index and
-- exactly one wins. Postgres decides, not the application.
--
-- `customer_key` is the lower-cased email. That is the same identity the shop
-- already uses to find orders and send mail, and it is the only one a guest
-- checkout has. It is deliberately not a strong control: a determined person
-- can use another address. It stops the same customer casually reusing a code,
-- which is what the limit is for; `max_redemptions` remains the hard ceiling.

ALTER TABLE "coupons" ADD COLUMN "max_per_customer" integer;

CREATE TABLE "coupon_redemptions" (
  "id" text PRIMARY KEY NOT NULL,
  "coupon_id" text NOT NULL REFERENCES "coupons"("id") ON DELETE CASCADE,
  -- Not a foreign key: an order is written after the redemption is claimed,
  -- and the claim has to survive an order that then fails to write — otherwise
  -- a failed checkout silently returns a redemption the customer already used.
  "order_id" text,
  "customer_key" text NOT NULL,
  "slot" integer NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

-- The lock. Two checkouts racing for the same customer's next slot both try to
-- insert the same (coupon, customer, slot) and one fails.
CREATE UNIQUE INDEX "coupon_redemptions_slot_unique"
  ON "coupon_redemptions" ("coupon_id", "customer_key", "slot");

CREATE INDEX "coupon_redemptions_coupon_customer_idx"
  ON "coupon_redemptions" ("coupon_id", "customer_key");

-- Backfilled from the orders that already used each code, so a per-customer
-- limit set on an existing coupon counts from the truth rather than from zero.
INSERT INTO "coupon_redemptions" ("id", "coupon_id", "order_id", "customer_key", "slot")
SELECT
  gen_random_uuid()::text,
  c."id",
  o."id",
  lower(o."customer_email"),
  (row_number() OVER (PARTITION BY c."id", lower(o."customer_email") ORDER BY o."created_at") - 1)::int
FROM "orders" o
JOIN "coupons" c ON upper(c."code") = upper(o."coupon_code")
WHERE o."coupon_code" IS NOT NULL;
