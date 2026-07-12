import type {
  AddressChainStatus,
  ChainDataProvider,
} from '@/modules/payments/application/ports/bitcoin-ports';

interface EsploraTx {
  vout: { scriptpubkey_address?: string; value: number }[];
  status: { confirmed: boolean; block_height?: number };
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

    let confirmedSats = 0;
    let bestConfirmations = 0;

    for (const tx of txs) {
      const receivedSats = tx.vout
        .filter((o) => o.scriptpubkey_address === address)
        .reduce((sum, o) => sum + o.value, 0);
      if (receivedSats === 0) continue;

      confirmedSats += receivedSats;
      if (tx.status.confirmed && tx.status.block_height) {
        const confirmations = tipHeight - tx.status.block_height + 1;
        bestConfirmations = Math.max(bestConfirmations, confirmations);
      }
    }

    return { address, confirmedSats, confirmations: bestConfirmations };
  }
}
