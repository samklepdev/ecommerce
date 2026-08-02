import { describe, expect, it } from 'vitest';

import {
  classifyPaymentReference,
  FindOrderByPaymentReference,
  type PaymentAddressLookup,
  type TransactionLookup,
} from './find-order-by-payment-reference';
import type { BitcoinPaymentIntent } from '@/modules/payments/application/ports/bitcoin-ports';

const TXID = 'a'.repeat(64);
const ADDRESS = 'tb1qxhy8t93tsjctu8d3ta79qs078cf9zwu8mqf0zn';

function makeFakePayments(byAddress: Record<string, string> = {}) {
  const asked: string[] = [];
  const lookup: PaymentAddressLookup = {
    async findByAddress(address) {
      asked.push(address);
      const orderId = byAddress[address];
      return orderId ? ({ orderId, address } as BitcoinPaymentIntent) : null;
    },
  };
  return { lookup, asked };
}

function makeFakeTransactions(addresses: string[] | 'throw') {
  const lookup: TransactionLookup = {
    async addressesPaidBy() {
      if (addresses === 'throw') throw new Error('esplora unavailable');
      return addresses;
    },
  };
  return lookup;
}

describe('classifyPaymentReference', () => {
  /**
   * A txid is 64 hex characters and no Bitcoin address is — bech32 is at most
   * 62 and never pure hex, base58 excludes several hex digits. So one search
   * box can take either without the admin having to say which.
   */
  it('recognises a transaction id', () => {
    expect(classifyPaymentReference(TXID)).toBe('txid');
    expect(classifyPaymentReference(TXID.toUpperCase())).toBe('txid');
  });

  it('recognises addresses of every shape the app issues or accepts', () => {
    expect(classifyPaymentReference(ADDRESS)).toBe('address');
    expect(classifyPaymentReference('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4')).toBe('address');
    expect(classifyPaymentReference('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2')).toBe('address');
    expect(classifyPaymentReference('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy')).toBe('address');
  });

  it('is not fooled by something merely 64 characters long', () => {
    expect(classifyPaymentReference('z'.repeat(64))).toBe('address');
  });

  it('ignores surrounding whitespace, which a paste routinely carries', () => {
    expect(classifyPaymentReference(`  ${TXID}  `)).toBe('txid');
  });
});

describe('FindOrderByPaymentReference', () => {
  describe('by address', () => {
    it('finds the order that address belongs to', async () => {
      const { lookup, asked } = makeFakePayments({ [ADDRESS]: 'order-1' });

      const result = await new FindOrderByPaymentReference(
        lookup,
        makeFakeTransactions([]),
      ).execute({ reference: ADDRESS });

      expect(result).toEqual({
        kind: 'address',
        orderId: 'order-1',
        addresses: [ADDRESS],
        lookupFailed: false,
      });
      expect(asked).toEqual([ADDRESS]);
    });

    it('reports no match for an address this shop never issued', async () => {
      const { lookup } = makeFakePayments();

      const result = await new FindOrderByPaymentReference(
        lookup,
        makeFakeTransactions([]),
      ).execute({ reference: ADDRESS });

      expect(result.orderId).toBeNull();
      expect(result.lookupFailed).toBe(false);
    });

    it('trims a pasted value before looking it up', async () => {
      const { lookup, asked } = makeFakePayments({ [ADDRESS]: 'order-1' });

      await new FindOrderByPaymentReference(lookup, makeFakeTransactions([])).execute({
        reference: `\n  ${ADDRESS} `,
      });

      expect(asked).toEqual([ADDRESS]);
    });
  });

  describe('by transaction id', () => {
    it('resolves the transaction to an order through the address it paid', async () => {
      const { lookup } = makeFakePayments({ [ADDRESS]: 'order-7' });

      const result = await new FindOrderByPaymentReference(
        lookup,
        makeFakeTransactions([ADDRESS]),
      ).execute({ reference: TXID });

      expect(result.kind).toBe('txid');
      expect(result.orderId).toBe('order-7');
    });

    it('checks every output, since a payment is rarely the only one', async () => {
      // A wallet's change output has its own address; ours may be second.
      const { lookup } = makeFakePayments({ [ADDRESS]: 'order-7' });

      const result = await new FindOrderByPaymentReference(
        lookup,
        makeFakeTransactions(['bc1qsomeoneelse', ADDRESS]),
      ).execute({ reference: TXID });

      expect(result.orderId).toBe('order-7');
    });

    /**
     * The case this exists for. A customer sends coins to an address we never
     * issued, or to a stale one — nothing in our records mentions that
     * transaction, so an index of our own txids could not answer it. Going to
     * the chain does, and reporting where the money actually went is the
     * answer to the support question rather than a failure to answer it.
     */
    it('reports where the money went when none of it was ours', async () => {
      const { lookup } = makeFakePayments();

      const result = await new FindOrderByPaymentReference(
        lookup,
        makeFakeTransactions(['bc1qsomeoneelse', 'bc1qanother']),
      ).execute({ reference: TXID });

      expect(result.orderId).toBeNull();
      expect(result.addresses).toEqual(['bc1qsomeoneelse', 'bc1qanother']);
      expect(result.lookupFailed).toBe(false);
    });

    it('distinguishes "could not ask" from "not ours"', async () => {
      // Telling an admin a transaction isn't theirs when the chain was simply
      // unreachable is worse than saying nothing — they stop looking.
      const { lookup } = makeFakePayments({ [ADDRESS]: 'order-7' });

      const result = await new FindOrderByPaymentReference(
        lookup,
        makeFakeTransactions('throw'),
      ).execute({ reference: TXID });

      expect(result.orderId).toBeNull();
      expect(result.lookupFailed).toBe(true);
    });

    it('does not consult the chain at all for an address', async () => {
      // An address is an indexed column; going to a third party for it would
      // make the common lookup depend on someone else's uptime.
      const { lookup } = makeFakePayments({ [ADDRESS]: 'order-1' });
      const transactions: TransactionLookup = {
        async addressesPaidBy() {
          throw new Error('must not be called for an address');
        },
      };

      const result = await new FindOrderByPaymentReference(lookup, transactions).execute({
        reference: ADDRESS,
      });

      expect(result.orderId).toBe('order-1');
    });
  });
});
