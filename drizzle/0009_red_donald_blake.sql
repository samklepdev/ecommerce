ALTER TABLE "bitcoin_payment_intents" ADD COLUMN "overpaid" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "order_lines" ADD COLUMN "fulfillment_issue" text;