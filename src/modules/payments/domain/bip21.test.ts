import { describe, expect, it } from 'vitest';
import { satsToBtcString, toBip21 } from './bip21';

describe('satsToBtcString', () => {
  it('formats zero sats', () => {
    expect(satsToBtcString(0)).toBe('0.00000000');
  });

  it('formats a typical sats amount to 8 decimal places', () => {
    expect(satsToBtcString(157001)).toBe('0.00157001');
  });

  it('formats a whole-BTC amount', () => {
    expect(satsToBtcString(100_000_000)).toBe('1.00000000');
  });

  it('does not lose precision for amounts near the 21M BTC supply cap', () => {
    // 21,000,000 BTC in sats
    expect(satsToBtcString(21_000_000 * 100_000_000)).toBe('21000000.00000000');
  });
});

describe('toBip21', () => {
  it('builds a bitcoin: URI with the address and formatted amount', () => {
    expect(toBip21('bc1qtest', 157001)).toBe('bitcoin:bc1qtest?amount=0.00157001');
  });
});
