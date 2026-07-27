-- Removes the product-variant concept: the product becomes the sellable unit.
--
-- Hand-written rather than generated, because drizzle-kit would emit the DDL
-- without the backfill between the steps — adding NOT NULL columns to a
-- populated `products` and dropping `product_variants` out from under three
-- foreign keys. The order below matters: copy the data up, repoint the
-- references, and only then drop the table.
--
-- Safe as an exact fold: every product had exactly one variant when this was
-- written (26 products, 26 variants), so no price, sku or order line changes
-- meaning. Should a multi-variant product ever exist, the backfill picks the
-- cheapest and the guard below aborts the migration rather than silently
-- discarding the rest.

--> statement-breakpoint
DO $$
DECLARE extra integer;
BEGIN
  SELECT count(*) INTO extra FROM (
    SELECT product_id FROM product_variants GROUP BY product_id HAVING count(*) > 1
  ) t;
  IF extra > 0 THEN
    RAISE EXCEPTION
      'Cannot fold variants: % product(s) have more than one variant. Reduce them to one first.', extra;
  END IF;
END $$;
--> statement-breakpoint

-- 1. Add the variant's columns to products, nullable for now so the backfill
--    has somewhere to land.
ALTER TABLE "products" ADD COLUMN "sku" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "unit_amount_minor" bigint;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "currency" text;--> statement-breakpoint

-- 2. Copy each product's variant up onto the product.
UPDATE "products" p SET
  "sku" = v."sku",
  "unit_amount_minor" = v."unit_amount_minor",
  "currency" = v."currency"
FROM "product_variants" v
WHERE v."product_id" = p."id";--> statement-breakpoint

-- 3. A product with no variant had no price and so was never sellable. Give
--    it a placeholder rather than dropping the row — an admin can price it,
--    and a draft product disappearing behind a migration would be worse.
UPDATE "products" SET
  "sku" = 'SKU-' || "id",
  "unit_amount_minor" = 0,
  "currency" = 'USD'
WHERE "sku" IS NULL;--> statement-breakpoint

ALTER TABLE "products" ALTER COLUMN "sku" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "unit_amount_minor" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "currency" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "products_sku_unique" ON "products" ("sku");--> statement-breakpoint

-- 4. Repoint everything that referenced a variant at the product instead.
--    Each table gets the new column backfilled through product_variants
--    while that table still exists.
ALTER TABLE "supplier_offers" ADD COLUMN "product_id" text;--> statement-breakpoint
UPDATE "supplier_offers" o SET "product_id" = v."product_id"
  FROM "product_variants" v WHERE v."id" = o."variant_id";--> statement-breakpoint
DELETE FROM "supplier_offers" WHERE "product_id" IS NULL;--> statement-breakpoint
ALTER TABLE "supplier_offers" ALTER COLUMN "product_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_offers"
  ADD CONSTRAINT "supplier_offers_product_id_products_id_fk"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE cascade;--> statement-breakpoint
DROP INDEX IF EXISTS "supplier_offers_variant_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "supplier_offers_preferred_unique";--> statement-breakpoint
ALTER TABLE "supplier_offers" DROP COLUMN "variant_id";--> statement-breakpoint
CREATE INDEX "supplier_offers_product_id_idx" ON "supplier_offers" ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_offers_preferred_unique"
  ON "supplier_offers" ("product_id") WHERE "is_preferred" = true;--> statement-breakpoint

-- order_lines and supplier_order_lines are history. They keep their own
-- denormalized sku/price snapshots, so repointing the reference doesn't
-- rewrite what any past order cost.
ALTER TABLE "order_lines" ADD COLUMN "product_id" text;--> statement-breakpoint
UPDATE "order_lines" l SET "product_id" = v."product_id"
  FROM "product_variants" v WHERE v."id" = l."variant_id";--> statement-breakpoint
ALTER TABLE "order_lines" ALTER COLUMN "product_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "order_lines"
  ADD CONSTRAINT "order_lines_product_id_products_id_fk"
  FOREIGN KEY ("product_id") REFERENCES "products"("id");--> statement-breakpoint
ALTER TABLE "order_lines" DROP COLUMN "variant_id";--> statement-breakpoint

ALTER TABLE "supplier_order_lines" ADD COLUMN "product_id" text;--> statement-breakpoint
UPDATE "supplier_order_lines" l SET "product_id" = v."product_id"
  FROM "product_variants" v WHERE v."id" = l."variant_id";--> statement-breakpoint
ALTER TABLE "supplier_order_lines" ALTER COLUMN "product_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_order_lines"
  ADD CONSTRAINT "supplier_order_lines_product_id_products_id_fk"
  FOREIGN KEY ("product_id") REFERENCES "products"("id");--> statement-breakpoint
ALTER TABLE "supplier_order_lines" DROP COLUMN "variant_id";--> statement-breakpoint

-- 5. Nothing references it any more.
DROP TABLE "product_variants";
