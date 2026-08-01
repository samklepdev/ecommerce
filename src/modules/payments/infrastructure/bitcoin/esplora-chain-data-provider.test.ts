import { describe, expect, it } from 'vitest';

import { aggregateChainStatus, type EsploraTx } from './esplora-chain-data-provider';

const ADDRESS = 'bc1qtest';
const EXPECTED = 100_000;

function confirmedTx(sats: number, blockHeight: number): EsploraTx {
  return {
    vout: [{ scriptpubkey_address: ADDRESS, value: sats }],
    status: { confirmed: true, block_height: blockHeight },
  };
}

function unconfirmedTx(sats: number): EsploraTx {
  return {
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
      vout: [{ scriptpubkey_address: 'bc1qsomeoneelse', value: 500_000 }],
      status: { confirmed: true, block_height: 1000 },
    };
    const result = aggregateChainStatus([otherAddressTx], ADDRESS, 1002, EXPECTED);
    expect(result).toEqual({ confirmedSats: 0, pendingSats: 0, confirmations: 0 });
  });

  it('sums multiple outputs to the address within the same tx', () => {
    const tx: EsploraTx = {
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
