import type {
  AddressChainStatus,
  ChainDataProvider,
} from '@/modules/payments/application/ports/bitcoin-ports';

export interface EsploraTx {
  vout: { scriptpubkey_address?: string; value: number }[];
  status: { confirmed: boolean; block_height?: number };
}

/**
 * Pure aggregation, split out from `getStatus` so it's unit-testable without
 * mocking `fetch`. Only confirmed transactions count toward `confirmedSats`
 * — an unconfirmed transaction (e.g. a customer's top-up still in the
 * mempool) must never be folded into the "confirmed" total, or the order
 * could be marked paid before that portion is actually safe.
 *
 * When more than one confirmed transaction pays the address, `confirmations`
 * is the MINIMUM among them, not the maximum — the combined `confirmedSats`
 * total isn't safely settled until its shallowest contributing transaction
 * also clears the required depth.
 */
export function aggregateChainStatus(
  txs: EsploraTx[],
  address: string,
  tipHeight: number,
): Pick<AddressChainStatus, 'confirmedSats' | 'confirmations'> {
  let confirmedSats = 0;
  const confirmedTxDepths: number[] = [];

  for (const tx of txs) {
    if (!tx.status.confirmed || tx.status.block_height === undefined) continue;

    const receivedSats = tx.vout
      .filter((o) => o.scriptpubkey_address === address)
      .reduce((sum, o) => sum + o.value, 0);
    if (receivedSats === 0) continue;

    confirmedSats += receivedSats;
    confirmedTxDepths.push(tipHeight - tx.status.block_height + 1);
  }

  const confirmations = confirmedTxDepths.length > 0 ? Math.min(...confirmedTxDepths) : 0;
  return { confirmedSats, confirmations };
}

/**
 * Queries an Esplora-compatible API. Dev default is the public mempool.space
 * API, which sees every address you query — self-host electrs/Esplora in
 * production for privacy.
 */
export class EsploraChainDataProvider implements ChainDataProvider {
  constructor(private readonly baseUrl: string) {}

  async getStatus(address: string): Promise<AddressChainStatus> {
    const [txsRes, tipRes] = await Promise.all([
      fetch(`${this.baseUrl}/address/${address}/txs`),
      fetch(`${this.baseUrl}/blocks/tip/height`),
    ]);
    if (!txsRes.ok) throw new Error(`esplora txs HTTP ${txsRes.status}`);
    if (!tipRes.ok) throw new Error(`esplora tip HTTP ${tipRes.status}`);

    const txs = (await txsRes.json()) as EsploraTx[];
    const tipHeight = Number(await tipRes.text());

    return { address, ...aggregateChainStatus(txs, address, tipHeight) };
  }
}
