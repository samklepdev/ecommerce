CREATE TABLE IF NOT EXISTS "welcome_emails" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"tracking_token" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"opened_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_url" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "welcome_emails" ADD CONSTRAINT "welcome_emails_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "welcome_emails_user_id_unique" ON "welcome_emails" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "welcome_emails_tracking_token_unique" ON "welcome_emails" USING btree ("tracking_token");