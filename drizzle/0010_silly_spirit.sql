CREATE TABLE IF NOT EXISTS "shipping_rates" (
	"id" text PRIMARY KEY NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_amount_minor" bigint DEFAULT 0 NOT NULL;