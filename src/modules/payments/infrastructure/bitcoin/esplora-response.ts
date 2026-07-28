import { z } from 'zod';

/**
 * Schemas for the Esplora HTTP API.
 *
 * This is the one place third-party data crosses into the payment path, and
 * what comes back decides whether an order is marked paid. It used to be a
 * cast (`as EsploraTx[]`), which is a claim about the data, not a check on
 * it — a rate-limit JSON body, an HTML error page served with a 200, or a
 * provider changing a field would all have sailed through and been read as
 * "no confirmed payments".
 *
 * Only the fields actually read are described; Esplora sends a great deal
 * more, and Zod ignores unknown keys by default, so a provider adding
 * fields won't break this.
 */

const EsploraVoutSchema = z.object({
  /** Absent for non-address outputs (e.g. OP_RETURN). Filtered, not rejected. */
  scriptpubkey_address: z.string().optional(),
  /** Satoshis: integer, never negative. Every amount in this codebase is
   * integer minor units, and a float here would propagate into
   * `confirmedSats` and quietly break that invariant. */
  value: z.number().int().nonnegative(),
});

const EsploraTxSchema = z.object({
  vout: z.array(EsploraVoutSchema),
  status: z.object({
    confirmed: z.boolean(),
    /** Absent while the transaction is still in the mempool. */
    block_height: z.number().int().positive().optional(),
  }),
});

const EsploraTxsSchema = z.array(EsploraTxSchema);

export type EsploraTx = z.infer<typeof EsploraTxSchema>;

/** Throws on anything that isn't a well-formed transaction list. The watcher
 * catches per-intent and retries on its next pass, so a bad response leaves
 * the order untouched rather than half-read. */
export function parseEsploraTxs(raw: unknown): EsploraTx[] {
  const result = EsploraTxsSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`esplora returned an unexpected transaction list: ${result.error.message}`);
  }
  return result.data;
}

/**
 * The tip height comes back as a plain-text integer.
 *
 * Worth its own check because the old `Number(text)` had two bad failure
 * modes: `Number('')` is 0 and `Number('<html>')` is NaN. Both would flow
 * into `tipHeight - block_height + 1` and yield a nonsense confirmation
 * depth — NaN compares false against the required depth, so an order would
 * sit unconfirmed forever with nothing logged.
 */
export function parseTipHeight(raw: string): number {
  const result = z.coerce
    .number()
    .int()
    .nonnegative()
    .safeParse(raw.trim() === '' ? NaN : raw.trim());
  if (!result.success) {
    throw new Error(`esplora returned an unexpected tip height: ${JSON.stringify(raw.slice(0, 40))}`);
  }
  return result.data;
}
