-- Refunds are not part of this product. `payment_status` is a plain text column
-- with no CHECK constraint, so removing `refunded` from the TypeScript union
-- needs no DDL — but it does need this guard.
--
-- A surviving `refunded` row would be read back through
-- `row.paymentStatus as PaymentStatus`, an unchecked cast, and become a value
-- nothing handles: `PAYMENT_TRANSITIONS['refunded']` is now `undefined`, so
-- `assertPaymentTransition` would throw a TypeError rather than a domain error,
-- and every status-tone lookup would fall through.
--
-- So this refuses to apply rather than letting that ship. There is deliberately
-- no automatic conversion: `paid` would misreport revenue for money that went
-- back, and `failed` would erase the fact it was ever received. Whoever hits
-- this has to decide what those orders should say, which is the point.

DO $$
DECLARE stragglers integer;
BEGIN
  SELECT count(*) INTO stragglers FROM "orders" WHERE "payment_status" = 'refunded';
  IF stragglers > 0 THEN
    RAISE EXCEPTION
      'Cannot drop the refunded status: % order(s) still have payment_status = ''refunded''. '
      'Decide what those orders should say and update them before migrating.', stragglers;
  END IF;
END $$;
