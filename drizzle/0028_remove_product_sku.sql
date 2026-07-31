-- Removes the product SKU, and changes the order-line snapshot from a SKU to
-- a product name.
--
-- Hand-written for two reasons. drizzle-kit can't tell a rename from a
-- drop-and-add and prompts for it, which needs a TTY (see CLAUDE.md). And the
-- rename needs a backfill *between* the steps: `order_lines.product_name` is
-- NOT NULL, and every existing row currently holds a SKU, which is not what
-- the column means afterwards.
--
-- Why at all: this store is dropship. There is no warehouse and no supplier
-- catalogue keyed by our own SKU, so the field was invented at creation time
-- and then read by nobody. Worse, it was the *only* thing an order line
-- carried to say what had been bought, so receipts and the fulfillment queue
-- showed customers strings like `WIDGET-BLUE-01` where a product name belongs.
--
-- The snapshot itself is deliberately kept, not replaced by a join. An order
-- line records what was bought at the moment it was bought; reading the name
-- back from the catalogue would let a later rename rewrite an old receipt.

--> statement-breakpoint

-- 1. Add the new snapshot nullable, so the backfill has somewhere to land.
ALTER TABLE "order_lines" ADD COLUMN "product_name" text;--> statement-breakpoint

-- 2. Fill it from the catalogue. This is the one moment the name may legally
--    be read across: the order line is being given its snapshot, and from
--    here on it keeps it.
UPDATE "order_lines" l SET "product_name" = p."name"
  FROM "products" p WHERE p."id" = l."product_id";--> statement-breakpoint

-- 3. Belt and braces. `order_lines.product_id` is a NO ACTION foreign key, so
--    a product with order lines cannot be deleted and this should match no
--    rows — but a receipt that says nothing would be worse than one still
--    saying the SKU it said yesterday.
UPDATE "order_lines" SET "product_name" = "sku" WHERE "product_name" IS NULL;--> statement-breakpoint

ALTER TABLE "order_lines" ALTER COLUMN "product_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "order_lines" DROP COLUMN "sku";--> statement-breakpoint

-- 4. Now nothing reads a product's SKU. Index first: dropping the column
--    would take it along, but naming it here means a failure says which.
DROP INDEX IF EXISTS "products_sku_unique";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "sku";
