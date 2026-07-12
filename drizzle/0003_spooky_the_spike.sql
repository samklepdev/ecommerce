ALTER TABLE "products" ADD COLUMN "image_url" text;--> statement-breakpoint
ALTER TABLE "supplier_offers" ADD COLUMN "last_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "supplier_offers" ADD COLUMN "last_sync_status" text DEFAULT 'never' NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_offers" ADD COLUMN "last_sync_error" text;--> statement-breakpoint
ALTER TABLE "supplier_offers" ADD COLUMN "auto_sync_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_offers" ADD COLUMN "scraped_title" text;