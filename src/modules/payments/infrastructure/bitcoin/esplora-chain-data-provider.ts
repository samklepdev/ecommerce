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

    const [txsRes, tipRes] = await Promise.all([
      fetch(`${this.baseUrl}/address/${address}/txs`, {
        signal: AbortSignal.timeout(CHAIN_FETCH_TIMEOUT_MS),
      }),
      fetch(`${this.baseUrl}/blocks/tip/height`, {
        signal: AbortSignal.timeout(CHAIN_FETCH_TIMEOUT_MS),
      }),
    ]);
    if (!txsRes.ok) throw new Error(`esplora txs HTTP ${txsRes.status}`);
    if (!tipRes.ok) throw new Error(`esplora tip HTTP ${tipRes.status}`);

    // Parsed, not cast: this response decides whether an order gets marked
    // paid, so it has to be checked like any other untrusted input.
    const txs = parseEsploraTxs(await txsRes.json());
    const tipHeight = parseTipHeight(await tipRes.text());

    return { address, ...aggregateChainStatus(txs, address, tipHeight, expectedSats) };
  }
}
