-- Records money that arrived at an intent's address *after* the app stopped
-- watching it.
--
-- `listWatchable` only returns intents whose status is still `awaiting` and
-- whose order deadline hasn't passed, so once an order expires or is cancelled
-- the address is never polled again. A customer paying at hour 25 — or paying
-- after cancelling — sends real bitcoin nobody looks for. Both columns are
-- written only by the late-payment sweep; null is the normal case.
--
-- NOTE for whoever adds 0030: check `_journal.json`'s `when` for this and
-- 0021. Both are stamped above real wall-clock time, and `migrate()` silently
-- skips anything below the newest applied `created_at`.

ALTER TABLE "bitcoin_payment_intents" ADD COLUMN "late_payment_sats" bigint;--> statement-breakpoint
ALTER TABLE "bitcoin_payment_intents" ADD COLUMN "late_payment_seen_at" timestamp with time zone;