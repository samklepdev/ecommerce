import * as bitcoin from 'bitcoinjs-lib';
import { BIP32Factory, type BIP32Interface } from 'bip32';
import * as ecc from 'tiny-secp256k1';

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
    const child = this.account.derive(0).derive(index);
    const { address } = bitcoin.payments.p2wpkh({
      pubkey: child.publicKey,
      network: this.network,
    });
    if (!address) throw new Error(`failed to derive address at index ${index}`);
    return address;
  }
}
