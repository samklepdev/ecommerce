import { describe, expect, it } from 'vitest';

import { aggregateChainStatus, type EsploraTx } from './esplora-chain-data-provider';

const ADDRESS = 'bc1qtest';

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
  it('is zero/zero with no transactions', () => {
    expect(aggregateChainStatus([], ADDRESS, 1000)).toEqual({ confirmedSats: 0, confirmations: 0 });
  });

  it('counts a single confirmed tx', () => {
    // Tip 1002, tx at height 1000 -> 3 confirmations (1002 - 1000 + 1).
    const result = aggregateChainStatus([confirmedTx(100_000, 1000)], ADDRESS, 1002);
    expect(result).toEqual({ confirmedSats: 100_000, confirmations: 3 });
  });

  it('does not count an unconfirmed tx toward confirmedSats or confirmations', () => {
    const result = aggregateChainStatus([unconfirmedTx(100_000)], ADDRESS, 1002);
    expect(result).toEqual({ confirmedSats: 0, confirmations: 0 });
  });

  it('excludes an unconfirmed top-up from confirmedSats even when an earlier tx is confirmed', () => {
    // The bug scenario: a confirmed 60k tx plus a still-unconfirmed 40k
    // top-up must NOT be reported as 100k confirmed sats — only the 60k
    // that's actually settled counts.
    const result = aggregateChainStatus(
      [confirmedTx(60_000, 1000), unconfirmedTx(40_000)],
      ADDRESS,
      1002,
    );
    expect(result.confirmedSats).toBe(60_000);
  });

  it('reports the minimum confirmation count among multiple confirmed txs, not the maximum', () => {
    // tx at 1000 -> 3 confirmations; tx at 1001 -> 2 confirmations. The
    // shallower tx's depth governs, since its funds aren't safe until it
    // clears the threshold too.
    const result = aggregateChainStatus(
      [confirmedTx(30_000, 1000), confirmedTx(70_000, 1001)],
      ADDRESS,
      1002,
    );
    expect(result).toEqual({ confirmedSats: 100_000, confirmations: 2 });
  });

  it('ignores transactions paying a different address', () => {
    const otherAddressTx: EsploraTx = {
      vout: [{ scriptpubkey_address: 'bc1qsomeoneelse', value: 500_000 }],
      status: { confirmed: true, block_height: 1000 },
    };
    const result = aggregateChainStatus([otherAddressTx], ADDRESS, 1002);
    expect(result).toEqual({ confirmedSats: 0, confirmations: 0 });
  });

  it('sums multiple outputs to the address within the same tx', () => {
    const tx: EsploraTx = {
      vout: [
        { scriptpubkey_address: ADDRESS, value: 30_000 },
        { scriptpubkey_address: ADDRESS, value: 20_000 },
      ],
      status: { confirmed: true, block_height: 1000 },
    };
    const result = aggregateChainStatus([tx], ADDRESS, 1002);
    expect(result.confirmedSats).toBe(50_000);
  });
});
