import type * as bitcoin from 'bitcoinjs-lib';

import type {
  AddressChainStatus,
  ChainDataProvider,
} from '@/modules/payments/application/ports/bitcoin-ports';
import { parseEsploraTxs, parseTipHeight, type EsploraTx } from './esplora-response';
import { assertValidBitcoinAddress } from './bitcoin-address';

export type { EsploraTx };

interface ConfirmedContribution {
  sats: number;
  depth: number;
  blockHeight: number;
}

/**
 * Depth of the payment, which is not the same as depth of the address.
 *
 * Walking oldest-first, this is the minimum depth across the smallest set of
 * transactions that covers `expectedSats` — i.e. how deep the *payment* is
 * buried, ignoring anything that arrived after it was already covered.
 *
 * The distinction is a security property, not a nicety. Taking the minimum
 * across every transaction touching the address meant anyone could hold an
 * order below the confirmation threshold forever: the address is public the
 * instant the customer pays, so 546 sats every block pinned depth at 1, the
 * order never settled, and at 48h `FailStuckAwaitingConfirmationOrders` moved
 * it to `failed` — terminal, unrefundable, with the customer's money on it.
 *
 * Dust that arrives *before* the payment is still inside the covering prefix,
 * but being older it is deeper, so it cannot lower the minimum either.
 *
 * When the confirmed total never reaches `expectedSats` there is no covering
 * prefix, so this falls back to the minimum across everything. That order is
 * underpaid regardless, and depth is not what gates it.
 */
function coveringDepth(contributions: ConfirmedContribution[], expectedSats: number): number {
  if (contributions.length === 0) return 0;

  const oldestFirst = [...contributions].sort((a, b) => a.blockHeight - b.blockHeight);
  let runningSats = 0;
  let depth = Infinity;
  for (const contribution of oldestFirst) {
    runningSats += contribution.sats;
    depth = Math.min(depth, contribution.depth);
    if (runningSats >= expectedSats) break;
  }
  return depth;
}

/**
 * Pure aggregation, split out from `getStatus` so it's unit-testable without
 * mocking `fetch`. Only confirmed transactions count toward `confirmedSats`
 * — an unconfirmed transaction must never be folded into the "confirmed"
 * total, or the order could be marked paid before that portion is safe.
 *
 * Unconfirmed value is reported separately as `pendingSats`. "We can see it,
 * it just isn't safe yet" is a different fact from "nothing has arrived", and
 * only the first may hold an order open past its deadline or block a
 * re-quote. Nothing that decides settlement reads it.
 */
export function aggregateChainStatus(
  txs: EsploraTx[],
  address: string,
  tipHeight: number,
  expectedSats: number,
): Pick<AddressChainStatus, 'confirmedSats' | 'pendingSats' | 'confirmations'> {
  let confirmedSats = 0;
  let pendingSats = 0;
  const contributions: ConfirmedContribution[] = [];

  for (const tx of txs) {
    const receivedSats = tx.vout
      .filter((o) => o.scriptpubkey_address === address)
      .reduce((sum, o) => sum + o.value, 0);
    if (receivedSats === 0) continue;

    if (!tx.status.confirmed || tx.status.block_height === undefined) {
      pendingSats += receivedSats;
      continue;
    }

    confirmedSats += receivedSats;
    contributions.push({
      sats: receivedSats,
      depth: tipHeight - tx.status.block_height + 1,
      blockHeight: tx.status.block_height,
    });
  }

  return {
    confirmedSats,
    pendingSats,
    confirmations: coveringDepth(contributions, expectedSats),
  };
}

/**
 * How long to wait for the chain provider before giving up on one address.
 *
 * Bare `fetch` has effectively no request timeout — undici only applies a
 * 300-second headers timeout — and the watcher polls intents strictly
 * sequentially. A provider that accepts connections and then black-holes them
 * therefore turned each intent into a ~5-minute stall, so a single stuck
 * address delayed settlement for every customer queued behind it, while the
 * heartbeat kept reporting healthy.
 *
 * Ten seconds: an address with many transactions is a genuinely larger
 * response than the price feed's, so this is more generous than the rate
 * provider's timeout.
 */
const CHAIN_FETCH_TIMEOUT_MS = 10_000;

/**
 * Confirmed transactions Esplora returns per page. A full page means there may
 * be more; a short one is the end of the history.
 *
 * Matching the reference implementation. A provider returning fewer per page
 * still works — the loop follows the cursor until a page comes back short —
 * it just costs more requests.
 */
const CONFIRMED_TXS_PER_PAGE = 25;

/**
 * How many pages to follow before giving up. 25 pages is 625 confirmed
 * transactions against a single order's address, which no legitimate payment
 * produces; past that something is wrong with the provider or the address is
 * being flooded, and either way the watcher should move on rather than spin.
 */
const MAX_TX_PAGES = 25;

/**
 * Queries an Esplora-compatible API. Dev default is the public mempool.space
 * API, which sees every address you query — self-host electrs/Esplora in
 * production for privacy.
 */
export class EsploraChainDataProvider implements ChainDataProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly network: bitcoin.networks.Network,
  ) {}

  async getStatus(address: string, expectedSats: number): Promise<AddressChainStatus> {
    // Checked before it reaches the request path. The address is read back
    // from the database and interpolated into a URL, so a malformed value
    // would reshape the request rather than address it.
    assertValidBitcoinAddress(address, this.network);

    const [txs, tipHeight] = await Promise.all([
      this.fetchAllTxs(address),
      this.fetchTipHeight(),
    ]);

    return { address, ...aggregateChainStatus(txs, address, tipHeight, expectedSats) };
  }

  /**
   * Every transaction touching the address, following Esplora's cursor.
   *
   * `/address/:addr/txs` returns the mempool plus only the **most recent page**
   * of confirmed transactions — 25 on the reference implementation. The code
   * used to issue exactly that one request and treat the result as the whole
   * history.
   *
   * That is not merely incomplete, it is unsafe in one specific direction:
   * `aggregateChainStatus` recomputes the total from scratch each pass and
   * `recordProgress` writes it over `confirmed_sats`, so a payment pushed out
   * of the window **revises the recorded amount downward**. Since the address
   * is public the moment the customer pays, roughly a page of dust
   * transactions displaces the real payment, the order reads as underpaid, and
   * at 48 hours it goes terminal with the customer's money on it.
   */
  private async fetchAllTxs(address: string): Promise<EsploraTx[]> {
    const all: EsploraTx[] = [];
    let cursor: string | null = null;

    for (let page = 0; page < MAX_TX_PAGES; page += 1) {
      const url = cursor
        ? `${this.baseUrl}/address/${address}/txs/chain/${cursor}`
        : `${this.baseUrl}/address/${address}/txs`;

      const res = await fetch(url, { signal: AbortSignal.timeout(CHAIN_FETCH_TIMEOUT_MS) });
      if (!res.ok) throw new Error(`esplora txs HTTP ${res.status}`);

      // Parsed, not cast: this response decides whether an order gets marked
      // paid, so it has to be checked like any other untrusted input.
      const batch = parseEsploraTxs(await res.json());
      all.push(...batch);

      // Only confirmed transactions paginate — the mempool is returned in full
      // on the first page, and the cursor endpoint serves confirmed history.
      // Counting the whole batch here would stop early on a first page that is
      // mostly mempool, and re-request forever on later ones.
      const confirmed = batch.filter((tx) => tx.status.confirmed);
      if (confirmed.length < CONFIRMED_TXS_PER_PAGE) return all;

      cursor = confirmed[confirmed.length - 1]!.txid;
    }

    /**
     * A provider that never returns a short page would otherwise spin here
     * forever, on the watcher's thread, blocking every other order behind it.
     * Throwing surfaces it: the watcher catches per intent, logs, and tries
     * again next pass, which is the same handling every other chain failure
     * gets — and far better than settling an order on a partial history.
     */
    throw new Error(`esplora returned too many transaction pages for ${address}`);
  }

  private async fetchTipHeight(): Promise<number> {
    const res = await fetch(`${this.baseUrl}/blocks/tip/height`, {
      signal: AbortSignal.timeout(CHAIN_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`esplora tip HTTP ${res.status}`);
    return parseTipHeight(await res.text());
  }
}
