-- Turns the free-text `products.category` into a real table.
--
-- The DDL here is generated; the backfill between it and the column drop in
-- 0023 is hand-written, because drizzle-kit emits structure and never data —
-- run as generated, this would have created an empty table and left every
-- product uncategorized.
--
-- Slugs come from the existing names. Two names that differ only in
-- punctuation or case would collide ("Seed backup" and "seed-backup" both
-- slug to `seed-backup`), so the guard below aborts rather than dropping one
-- silently: resolve the duplicates by hand and re-run.

CREATE TABLE "categories" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "category_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_name_unique" ON "categories" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_slug_unique" ON "categories" USING btree ("slug");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "products_category_id_idx" ON "products" USING btree ("category_id");--> statement-breakpoint

-- Abort if two existing category names would slug to the same string.
DO $$
DECLARE clashes integer;
BEGIN
  SELECT count(*) INTO clashes FROM (
    SELECT trim(both '-' from lower(regexp_replace(btrim(category), '[^a-zA-Z0-9]+', '-', 'g'))) AS slug
    FROM (SELECT DISTINCT btrim(category) AS category FROM products
          WHERE category IS NOT NULL AND btrim(category) <> '') d
    GROUP BY 1 HAVING count(*) > 1
  ) t;
  IF clashes > 0 THEN
    RAISE EXCEPTION
      'Cannot create categories: % name(s) collide on slug. Rename them apart first.', clashes;
  END IF;
END $$;--> statement-breakpoint

-- One row per distinct name actually in use. Whitespace-only values are
-- treated as uncategorized, not as a category called " ".
INSERT INTO "categories" ("id", "name", "slug")
SELECT
  gen_random_uuid()::text,
  category,
  trim(both '-' from lower(regexp_replace(category, '[^a-zA-Z0-9]+', '-', 'g')))
FROM (
  SELECT DISTINCT btrim(category) AS category
  FROM products
  WHERE category IS NOT NULL AND btrim(category) <> ''
) d;--> statement-breakpoint

-- Point the products at them. Matches on the trimmed name, the same value
-- the insert above used as the category's name.
UPDATE "products" p
SET "category_id" = c."id"
FROM "categories" c
WHERE btrim(p."category") = c."name";--> statement-breakpoint

-- Nothing may be left behind: a product that had a category must now have a
-- category_id. Catches a name that changed underneath the backfill.
DO $$
DECLARE orphaned integer;
BEGIN
  SELECT count(*) INTO orphaned FROM products
  WHERE category IS NOT NULL AND btrim(category) <> '' AND category_id IS NULL;
  IF orphaned > 0 THEN
    RAISE EXCEPTION 'Backfill incomplete: % product(s) still have no category_id.', orphaned;
  END IF;
END $$;
