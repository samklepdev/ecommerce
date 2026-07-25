CREATE TABLE IF NOT EXISTS "analytics_events" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"session_id" text,
	"user_id" text,
	"path" text,
	"referrer" text,
	"user_agent" text,
	"ip_address" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "order_events" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"event_type" text NOT NULL,
	"status" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_events_type_created_at_idx" ON "analytics_events" USING btree ("event_type","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_events_order_id_idx" ON "order_events" USING btree ("order_id");