import { describe, expect, it } from 'vitest';

import { parseEsploraTxs, parseTipHeight } from './esplora-response';

const validTx = {
  txid: 'tx-fixture',
  vout: [{ scriptpubkey_address: 'bc1qexample', value: 157001 }],
  status: { confirmed: true, block_height: 800000 },
};

describe('parseEsploraTxs', () => {
  it('accepts a well-formed response', () => {
    expect(parseEsploraTxs([validTx])).toEqual([validTx]);
  });

  it('accepts an unconfirmed transaction, which carries no block height', () => {
    const mempool = { txid: 'tx-mempool', vout: [{ scriptpubkey_address: 'bc1qx', value: 1 }], status: { confirmed: false } };
    expect(parseEsploraTxs([mempool])).toHaveLength(1);
  });

  it('accepts an output paying an address we did not ask about', () => {
    // Change outputs have their own address; they're filtered later, not rejected.
    const withChange = { ...validTx, vout: [...validTx.vout, { value: 5 }] };
    expect(parseEsploraTxs([withChange])).toHaveLength(1);
  });

  // Satoshis are integers everywhere in this codebase. A float here would
  // propagate into confirmedSats and quietly break that.
  it('rejects a fractional output value', () => {
    const fractional = { ...validTx, vout: [{ scriptpubkey_address: 'bc1qx', value: 0.5 }] };
    expect(() => parseEsploraTxs([fractional])).toThrow(/esplora/i);
  });

  it('rejects a negative output value', () => {
    const negative = { ...validTx, vout: [{ scriptpubkey_address: 'bc1qx', value: -1 }] };
    expect(() => parseEsploraTxs([negative])).toThrow(/esplora/i);
  });

  it('rejects a response that is not an array', () => {
    expect(() => parseEsploraTxs({ error: 'rate limited' })).toThrow(/esplora/i);
  });

  it('rejects a transaction missing its status', () => {
    expect(() => parseEsploraTxs([{ vout: [] }])).toThrow(/esplora/i);
  });

  it('rejects an HTML error page returned with a 200', () => {
    expect(() => parseEsploraTxs('<!doctype html><h1>502</h1>')).toThrow(/esplora/i);
  });
});

describe('parseTipHeight', () => {
  it('accepts the plain-text height Esplora returns', () => {
    expect(parseTipHeight('800123')).toBe(800123);
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseTipHeight(' 800123\n')).toBe(800123);
  });

  // Number('') is 0 and Number('nonsense') is NaN. Either would flow into the
  // confirmation-depth arithmetic and produce a nonsense depth rather than an
  // error, leaving an order stuck instead of retried.
  it('rejects an empty body', () => {
    expect(() => parseTipHeight('')).toThrow(/tip height/i);
  });

  it('rejects a non-numeric body', () => {
    expect(() => parseTipHeight('<!doctype html>')).toThrow(/tip height/i);
  });

  it('rejects a fractional height', () => {
    expect(() => parseTipHeight('800123.5')).toThrow(/tip height/i);
  });

  // The pagination cursor. Without it there is no way to ask for the next page
  // of confirmed transactions, so an address with more than fits in one page
  // would silently report only part of what it holds.
  it('rejects a transaction with no txid', () => {
    const noTxid: Record<string, unknown> = { ...validTx };
    delete noTxid.txid;
    expect(() => parseEsploraTxs([noTxid])).toThrow(/unexpected/i);
  });
});
