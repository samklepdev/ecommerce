import { describe, expect, it } from 'vitest';
import * as bitcoin from 'bitcoinjs-lib';

import { assertValidBitcoinAddress, isValidBitcoinAddress } from './bitcoin-address';

const mainnet = bitcoin.networks.bitcoin;
const testnet = bitcoin.networks.testnet;

// BIP173 test vectors plus well-known base58 examples.
const MAINNET_BECH32 = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
const TESTNET_BECH32 = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx';
const MAINNET_P2PKH = '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2';
const MAINNET_P2SH = '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy';

describe('isValidBitcoinAddress', () => {
  it('accepts a native segwit address on its own network', () => {
    expect(isValidBitcoinAddress(MAINNET_BECH32, mainnet)).toBe(true);
    expect(isValidBitcoinAddress(TESTNET_BECH32, testnet)).toBe(true);
  });

  it('accepts legacy and p2sh forms', () => {
    expect(isValidBitcoinAddress(MAINNET_P2PKH, mainnet)).toBe(true);
    expect(isValidBitcoinAddress(MAINNET_P2SH, mainnet)).toBe(true);
  });

  // The expensive mistake: paying a mainnet address from a testnet build, or
  // watching an address that can never receive the funds.
  it('rejects an address from the other network', () => {
    expect(isValidBitcoinAddress(MAINNET_BECH32, testnet)).toBe(false);
    expect(isValidBitcoinAddress(TESTNET_BECH32, mainnet)).toBe(false);
  });

  it('rejects an address with a corrupted checksum', () => {
    const corrupted = MAINNET_BECH32.slice(0, -1) + (MAINNET_BECH32.endsWith('4') ? '5' : '4');
    expect(isValidBitcoinAddress(corrupted, mainnet)).toBe(false);
  });

  it('rejects empty and obviously non-address strings', () => {
    for (const bad of ['', '   ', 'not-an-address', '0x1234']) {
      expect(isValidBitcoinAddress(bad, mainnet)).toBe(false);
    }
  });

  // This one matters because the address is interpolated into the Esplora
  // request path — a value carrying slashes or a query string would reshape
  // the URL rather than address it.
  it('rejects anything carrying URL structure', () => {
    for (const bad of [
      `${MAINNET_BECH32}/../blocks`,
      `${MAINNET_BECH32}?x=1`,
      `${MAINNET_BECH32}#frag`,
      'http://evil.test/',
    ]) {
      expect(isValidBitcoinAddress(bad, mainnet)).toBe(false);
    }
  });
});

describe('assertValidBitcoinAddress', () => {
  it('returns the address when it is valid', () => {
    expect(assertValidBitcoinAddress(MAINNET_BECH32, mainnet)).toBe(MAINNET_BECH32);
  });

  it('throws without echoing an arbitrary value back into the message', () => {
    expect(() => assertValidBitcoinAddress('http://evil.test/', mainnet)).toThrow(
      /not a valid bitcoin address/i,
    );
    expect(() => assertValidBitcoinAddress('http://evil.test/', mainnet)).not.toThrow(
      /evil\.test/,
    );
  });
});
