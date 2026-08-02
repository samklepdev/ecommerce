-- Coupons that stop working.
--
-- A code had exactly one control: `is_active`. No end date, no cap on how many
-- orders could use it, and no count of how many had. So a campaign code
-- outlived its campaign — posted to a deals site, still discounting orders
-- months later — and the only way to notice was for someone to read the coupon
-- list and remember what it was for.
--
-- All three columns are nullable-or-zero defaults, so every existing coupon
-- keeps behaving exactly as it does today: no expiry, no limit, nothing used.

ALTER TABLE "coupons" ADD COLUMN "expires_at" timestamptz;
ALTER TABLE "coupons" ADD COLUMN "max_redemptions" integer;
ALTER TABLE "coupons" ADD COLUMN "redemption_count" integer DEFAULT 0 NOT NULL;

-- Backfilled from the orders that already used each code, so a limit set on an
-- existing coupon counts from the truth rather than from zero. `coupon_code` is
-- snapshotted on the order at PlaceOrder time and normalised to upper case by
-- the domain, so this matches the same way the lookup does.
UPDATE "coupons" c
SET "redemption_count" = (
  SELECT count(*)
  FROM "orders" o
  WHERE upper(o."coupon_code") = upper(c."code")
);
