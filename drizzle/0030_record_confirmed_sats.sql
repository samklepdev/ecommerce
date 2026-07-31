-- Persists what actually arrived on-chain, not just what was asked for.
--
-- The watcher already computed this every pass and discarded it, so the
-- business could not say how short an underpaid order was, or how much an
-- overpaid one had sent — the one figure that decides what to do about either.
-- The revenue report was substituting `expected_sats` and documenting that it
-- was doing so.
--
-- Defaults to 0, not null: existing rows have genuinely never had this
-- observed, and 0 says that honestly while matching `confirmations`. The
-- report treats a paid order still reading 0 as "recorded before this column
-- existed" and falls back.

ALTER TABLE "bitcoin_payment_intents" ADD COLUMN "confirmed_sats" bigint DEFAULT 0 NOT NULL;