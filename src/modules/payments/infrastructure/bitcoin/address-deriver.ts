import * as bitcoin from 'bitcoinjs-lib';
import { BIP32Factory, type BIP32Interface } from 'bip32';
import * as ecc from 'tiny-secp256k1';

import { assertValidBitcoinAddress } from './bitcoin-address';

bitcoin.initEccLib(ecc);
const bip32 = BIP32Factory(ecc);

/**
 * Derives receive addresses from a watch-only account xpub (m/84'/0'/0').
 * Holds only the public key — cannot sign, cannot spend. This is the ONLY
 * file in the codebase that derives BTC addresses.
 */
export class HdAddressDeriver {
  private readonly account: BIP32Interface;

  constructor(
    accountXpub: string,
    private readonly network: bitcoin.networks.Network,
  ) {
    this.account = bip32.fromBase58(accountXpub, network);
    if (!this.account.isNeutered()) {
      throw new Error('BTC_ACCOUNT_XPUB must be a public (watch-only) key, not private');
    }
  }

  /** Receive-chain address (0/index). Change addresses (1/index) are never used. */
  deriveAddress(index: number): string {
    // The index comes from a Redis INCR, so this is a guard against a wiped
    // or tampered counter rather than ordinary input. Non-hardened
    // derivation only — an xpub cannot derive a hardened child, and asking
    // for one throws deep inside bip32 with a much less obvious message.
    if (!Number.isInteger(index) || index < 0 || index >= 0x80000000) {
      throw new Error(`address index must be a non-negative integer below 2^31, got ${index}`);
    }

    const child = this.account.derive(0).derive(index);
    const { address } = bitcoin.payments.p2wpkh({
      pubkey: child.publicKey,
      network: this.network,
    });
    if (!address) throw new Error(`failed to derive address at index ${index}`);
    // Belt and braces: this is the only address a customer will be asked to
    // pay, and an unusable one means funds sent nowhere we can see.
    return assertValidBitcoinAddress(address, this.network);
  }
}
