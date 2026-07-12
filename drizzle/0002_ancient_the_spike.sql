CREATE TABLE IF NOT EXISTS "supplier_offers" (
	"id" text PRIMARY KEY NOT NULL,
	"variant_id" text NOT NULL,
	"supplier_id" text NOT NULL,
	"supplier_product_url" text NOT NULL,
	"cost_amount_minor" bigint NOT NULL,
	"cost_currency" text NOT NULL,
	"is_available" boolean DEFAULT true NOT NULL,
	"is_preferred" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "supplier_order_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_order_id" text NOT NULL,
	"order_line_id" text NOT NULL,
	"variant_id" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_cost_minor" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "supplier_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"supplier_id" text NOT NULL,
	"status" text DEFAULT 'needs_ordering' NOT NULL,
	"supplier_order_reference" text,
	"cost_total_minor" bigint NOT NULL,
	"cost_currency" text NOT NULL,
	"tracking_number" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "suppliers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stock_items" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "stock_items" CASCADE;--> statement-breakpoint
ALTER TABLE "orders" RENAME COLUMN "reservation_expires_at" TO "payment_window_expires_at";--> statement-breakpoint
DROP INDEX IF EXISTS "orders_payment_status_reservation_expires_at_idx";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_address" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" text DEFAULT 'customer' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "supplier_offers" ADD CONSTRAINT "supplier_offers_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "supplier_offers" ADD CONSTRAINT "supplier_offers_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "supplier_order_lines" ADD CONSTRAINT "supplier_order_lines_supplier_order_id_supplier_orders_id_fk" FOREIGN KEY ("supplier_order_id") REFERENCES "public"."supplier_orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "supplier_order_lines" ADD CONSTRAINT "supplier_order_lines_order_line_id_order_lines_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "public"."order_lines"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "supplier_order_lines" ADD CONSTRAINT "supplier_order_lines_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "supplier_orders" ADD CONSTRAINT "supplier_orders_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "supplier_orders" ADD CONSTRAINT "supplier_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supplier_offers_variant_id_idx" ON "supplier_offers" USING btree ("variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "supplier_offers_preferred_unique" ON "supplier_offers" USING btree ("variant_id") WHERE "supplier_offers"."is_preferred" = true;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supplier_order_lines_supplier_order_id_idx" ON "supplier_order_lines" USING btree ("supplier_order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supplier_orders_order_id_idx" ON "supplier_orders" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supplier_orders_status_idx" ON "supplier_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_payment_status_payment_window_expires_at_idx" ON "orders" USING btree ("payment_status","payment_window_expires_at");