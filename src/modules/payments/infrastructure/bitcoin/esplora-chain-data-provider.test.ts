import { afterEach, describe, expect, it, vi } from 'vitest';
import { networks } from 'bitcoinjs-lib';

import {
  aggregateChainStatus,
  EsploraChainDataProvider,
  type EsploraTx,
} from './esplora-chain-data-provider';

const ADDRESS = 'bc1qtest';
const EXPECTED = 100_000;

let txSeq = 0;

function confirmedTx(sats: number, blockHeight: number): EsploraTx {
  txSeq += 1;
  return {
    txid: `tx-${txSeq}`,
    vout: [{ scriptpubkey_address: ADDRESS, value: sats }],
    status: { confirmed: true, block_height: blockHeight },
  };
}

function unconfirmedTx(sats: number): EsploraTx {
  txSeq += 1;
  return {
    txid: `tx-${txSeq}`,
    vout: [{ scriptpubkey_address: ADDRESS, value: sats }],
    status: { confirmed: false },
  };
}

describe('aggregateChainStatus', () => {
  it('is all-zero with no transactions', () => {
    expect(aggregateChainStatus([], ADDRESS, 1000, EXPECTED)).toEqual({
      confirmedSats: 0,
      pendingSats: 0,
      confirmations: 0,
    });
  });

  it('counts a single confirmed tx', () => {
    // Tip 1002, tx at height 1000 -> 3 confirmations (1002 - 1000 + 1).
    const result = aggregateChainStatus([confirmedTx(100_000, 1000)], ADDRESS, 1002, EXPECTED);
    expect(result).toEqual({ confirmedSats: 100_000, pendingSats: 0, confirmations: 3 });
  });

  it('does not count an unconfirmed tx toward confirmedSats or confirmations', () => {
    const result = aggregateChainStatus([unconfirmedTx(100_000)], ADDRESS, 1002, EXPECTED);
    expect(result.confirmedSats).toBe(0);
    expect(result.confirmations).toBe(0);
  });

  it('reports unconfirmed value as pendingSats', () => {
    // The whole point of the field: "we can see it, it just isn't safe yet"
    // is a different thing from "nothing has arrived", and only the first
    // may hold an order open past its deadline.
    const result = aggregateChainStatus([unconfirmedTx(100_000)], ADDRESS, 1002, EXPECTED);
    expect(result.pendingSats).toBe(100_000);
  });

  it('reports confirmed and pending separately when both are present', () => {
    const result = aggregateChainStatus(
      [confirmedTx(60_000, 1000), unconfirmedTx(40_000)],
      ADDRESS,
      1002,
      EXPECTED,
    );
    expect(result).toEqual({ confirmedSats: 60_000, pendingSats: 40_000, confirmations: 3 });
  });

  it('sums multiple unconfirmed txs into pendingSats', () => {
    const result = aggregateChainStatus(
      [unconfirmedTx(30_000), unconfirmedTx(20_000)],
      ADDRESS,
      1002,
      EXPECTED,
    );
    expect(result.pendingSats).toBe(50_000);
  });

  it('reports the minimum confirmation count among the txs that make up the payment', () => {
    // tx at 1000 -> 3 confirmations; tx at 1001 -> 2. The shallower one
    // governs, since its funds aren't safe until it clears the threshold too.
    const result = aggregateChainStatus(
      [confirmedTx(30_000, 1000), confirmedTx(70_000, 1001)],
      ADDRESS,
      1002,
      EXPECTED,
    );
    expect(result).toEqual({ confirmedSats: 100_000, pendingSats: 0, confirmations: 2 });
  });

  it('ignores transactions paying a different address', () => {
    const otherAddressTx: EsploraTx = {
      txid: 'tx-other-address',
      vout: [{ scriptpubkey_address: 'bc1qsomeoneelse', value: 500_000 }],
      status: { confirmed: true, block_height: 1000 },
    };
    const result = aggregateChainStatus([otherAddressTx], ADDRESS, 1002, EXPECTED);
    expect(result).toEqual({ confirmedSats: 0, pendingSats: 0, confirmations: 0 });
  });

  it('sums multiple outputs to the address within the same tx', () => {
    const tx: EsploraTx = {
      txid: 'tx-multi-output',
      vout: [
        { scriptpubkey_address: ADDRESS, value: 30_000 },
        { scriptpubkey_address: ADDRESS, value: 20_000 },
      ],
      status: { confirmed: true, block_height: 1000 },
    };
    const result = aggregateChainStatus([tx], ADDRESS, 1002, EXPECTED);
    expect(result.confirmedSats).toBe(50_000);
  });

  describe('depth is measured over the payment, not over the address', () => {
    it('a later dust payment cannot reset the confirmation clock', () => {
      // The griefing vector. The address is public the moment the customer
      // pays, so anyone can send 546 sats every block. Taking the minimum
      // across *every* tx meant depth was permanently 1, the order never
      // settled, and at 48h it went terminal with the customer's money on it.
      //
      // The real payment at height 1000 is 3 deep at tip 1002 and that is
      // what governs: the dust arrived after the payment was already covered.
      const result = aggregateChainStatus(
        [confirmedTx(100_000, 1000), confirmedTx(546, 1002)],
        ADDRESS,
        1002,
        EXPECTED,
      );
      expect(result.confirmations).toBe(3);
      // Still counted as money that arrived — it did.
      expect(result.confirmedSats).toBe(100_546);
    });

    it('holds even against dust in every block since the payment', () => {
      const result = aggregateChainStatus(
        [
          confirmedTx(100_000, 1000),
          confirmedTx(546, 1001),
          confirmedTx(546, 1002),
          confirmedTx(546, 1003),
        ],
        ADDRESS,
        1003,
        EXPECTED,
      );
      // Tip 1003, payment at 1000 -> 4 confirmations.
      expect(result.confirmations).toBe(4);
    });

    it('counts dust that arrived before the payment, which cannot lower the minimum anyway', () => {
      // Included in the covering prefix because it is older — and being
      // older it is deeper, so the payment's own depth still governs.
      const result = aggregateChainStatus(
        [confirmedTx(546, 995), confirmedTx(100_000, 1000)],
        ADDRESS,
        1002,
        EXPECTED,
      );
      expect(result.confirmations).toBe(3);
    });

    it('needs every tx of a split payment to clear, so the newest still governs', () => {
      // Not the same as the dust case: here the second tx is genuinely part
      // of what covers the total, so its shallower depth must win.
      const result = aggregateChainStatus(
        [confirmedTx(60_000, 1000), confirmedTx(40_000, 1002)],
        ADDRESS,
        1002,
        EXPECTED,
      );
      expect(result.confirmations).toBe(1);
    });

    it('falls back to the minimum across everything when the payment is short', () => {
      // Nothing covers `expected`, so there is no covering prefix to measure.
      // Depth isn't what gates an underpaid order anyway — it stays in
      // awaiting_confirmation on the amount, not the depth.
      const result = aggregateChainStatus(
        [confirmedTx(60_000, 1001)],
        ADDRESS,
        1002,
        EXPECTED,
      );
      expect(result).toEqual({ confirmedSats: 60_000, pendingSats: 0, confirmations: 2 });
    });

    it('treats exact coverage as covered', () => {
      const result = aggregateChainStatus(
        [confirmedTx(100_000, 1000), confirmedTx(546, 1002)],
        ADDRESS,
        1002,
        EXPECTED,
      );
      expect(result.confirmations).toBe(3);
    });
  });
});

/** A real testnet address, so `assertValidBitcoinAddress` lets the request
 * through — the provider checks before interpolating into a URL. */
const TESTNET_ADDRESS = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx';

describe('EsploraChainDataProvider pagination', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(pagesByUrl: (url: string) => unknown) {
    const requested: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      requested.push(url);
      if (url.endsWith('/blocks/tip/height')) {
        return { ok: true, text: async () => '1010' } as unknown as Response;
      }
      return { ok: true, json: async () => pagesByUrl(url) } as unknown as Response;
    });
    return requested;
  }

  function provider() {
    return new EsploraChainDataProvider('https://esplora.test', networks.testnet);
  }

  /** One page's worth of confirmed transactions, as Esplora returns them. */
  function page(count: number, startHeight: number, sats: number): EsploraTx[] {
    return Array.from({ length: count }, (_, i) => ({
      txid: `page-tx-${startHeight}-${i}`,
      vout: [{ scriptpubkey_address: TESTNET_ADDRESS, value: sats }],
      status: { confirmed: true as const, block_height: startHeight + i },
    }));
  }

  /**
   * Esplora returns at most 25 confirmed transactions per page, and the code
   * issued exactly one request. So an address with more than that reported
   * only the most recent 25 — and since the aggregate is recomputed from
   * scratch every pass and written over `confirmed_sats`, a customer's real
   * payment being pushed out of that window **revised the recorded total
   * downward**.
   *
   * That is an attack, not just an inaccuracy: ~25 dust transactions to an
   * address (public the moment the customer pays) displace the payment, the
   * order reads as underpaid, and at 48 hours it goes terminal with the
   * customer's money on it.
   */
  it('follows the chain cursor until the history is exhausted', async () => {
    const first = page(25, 900, 1000);
    const second = page(10, 800, 2000);
    const requested = stubFetch((url) =>
      url.includes('/txs/chain/') ? second : first,
    );

    const status = await provider().getStatus(TESTNET_ADDRESS, 100_000);

    // 25 x 1000 + 10 x 2000 — the second page is not silently dropped.
    expect(status.confirmedSats).toBe(45_000);
    expect(requested.some((u) => u.includes(`/txs/chain/${first[24]!.txid}`))).toBe(true);
  });

  it('stops at the first short page rather than looping forever', async () => {
    const requested = stubFetch(() => page(3, 900, 1000));

    await provider().getStatus(TESTNET_ADDRESS, 100_000);

    // One txs request (plus the tip): a short page means the end of history.
    expect(requested.filter((u) => u.includes('/address/')).length).toBe(1);
  });

  it('stops when a full page is followed by an empty one', async () => {
    const first = page(25, 900, 1000);
    const requested = stubFetch((url) => (url.includes('/txs/chain/') ? [] : first));

    const status = await provider().getStatus(TESTNET_ADDRESS, 100_000);

    expect(status.confirmedSats).toBe(25_000);
    expect(requested.filter((u) => u.includes('/address/')).length).toBe(2);
  });

  it('counts mempool transactions once, not on every page', async () => {
    // Unconfirmed transactions only appear on the first page; the cursor
    // endpoint returns confirmed history. Re-counting them would inflate
    // pendingSats and, through it, the "still owed" figure.
    const first: EsploraTx[] = [
      {
        txid: 'mempool-1',
        vout: [{ scriptpubkey_address: TESTNET_ADDRESS, value: 7_000 }],
        status: { confirmed: false },
      },
      ...page(25, 900, 1000),
    ];
    stubFetch((url) => (url.includes('/txs/chain/') ? [] : first));

    const status = await provider().getStatus(TESTNET_ADDRESS, 100_000);

    expect(status.pendingSats).toBe(7_000);
  });

  it('gives up after a bounded number of pages', async () => {
    // A provider that never returns a short page must not spin forever on the
    // watcher's thread, blocking every other order behind it.
    const requested = stubFetch(() => page(25, 900, 1));

    await expect(provider().getStatus(TESTNET_ADDRESS, 100_000)).rejects.toThrow(/too many/i);

    expect(requested.filter((u) => u.includes('/address/')).length).toBeLessThan(50);
  });
});
