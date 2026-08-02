import type { UseCase } from '@/shared/application/use-case';
import { logger } from '@/shared/infrastructure/logger';
import type { BitcoinPaymentIntent } from '@/modules/payments/application/ports/bitcoin-ports';

/** Narrowed to the one lookup this needs, rather than the whole store. */
export interface PaymentAddressLookup {
  findByAddress(address: string): Promise<BitcoinPaymentIntent | null>;
}

/** Narrowed likewise: resolving a transaction to the addresses it paid. */
export interface TransactionLookup {
  addressesPaidBy(txid: string): Promise<string[]>;
}

export interface FindOrderByPaymentReferenceInput {
  /** A BTC address or a transaction id, as the admin pasted it. */
  reference: string;
}

export type PaymentReferenceKind = 'address' | 'txid';

export interface FindOrderByPaymentReferenceResult {
  kind: PaymentReferenceKind;
  /** The order the reference belongs to, or null when nothing matches. */
  orderId: string | null;
  /**
   * For a txid: every address it paid. Reported even when none belongs to this
   * shop, because "this transaction went somewhere else entirely" is the
   * answer to a support question, not a failure to answer it.
   */
  addresses: string[];
  /** True when the chain could not be reached, so a null `orderId` means
   * "don't know" rather than "no". */
  lookupFailed: boolean;
}

/**
 * A transaction id is 64 hex characters. No Bitcoin address is — bech32 is at
 * most 62 and never pure hex, base58 excludes several hex digits — so the
 * shape alone tells the two apart, and an admin pasting either into one box
 * gets the right lookup without having to say which it is.
 */
const TXID = /^[0-9a-fA-F]{64}$/;

export function classifyPaymentReference(reference: string): PaymentReferenceKind {
  return TXID.test(reference.trim()) ? 'txid' : 'address';
}

/**
 * Finds the order a payment belongs to, from an address or a transaction id.
 *
 * One address per order is the whole correlation model, and there was no way
 * to search by it: `/admin/orders` matched customer email and the two status
 * enums, and the on-chain report covers only paid orders inside a date range —
 * which excludes exactly the orders a customer writes in about. So "I sent
 * coins to this address and nothing happened" had no lookup path at all, and
 * the answer required hand-written SQL.
 *
 * A txid is resolved through the chain rather than from our own records,
 * deliberately: nothing stores a txid, and more usefully, this then answers
 * for transactions we never saw — coins sent to an address we never issued, or
 * to a stale one from a re-quote. Those are the cases actually worth
 * investigating, and an index of our own txids could not contain them.
 */
export class FindOrderByPaymentReference
  implements UseCase<FindOrderByPaymentReferenceInput, FindOrderByPaymentReferenceResult>
{
  constructor(
    private readonly payments: PaymentAddressLookup,
    private readonly transactions: TransactionLookup,
  ) {}

  async execute(
    input: FindOrderByPaymentReferenceInput,
  ): Promise<FindOrderByPaymentReferenceResult> {
    const reference = input.reference.trim();
    const kind = classifyPaymentReference(reference);

    if (kind === 'address') {
      const intent = await this.payments.findByAddress(reference);
      return {
        kind,
        orderId: intent?.orderId ?? null,
        addresses: [reference],
        lookupFailed: false,
      };
    }

    let addresses: string[];
    try {
      addresses = await this.transactions.addressesPaidBy(reference);
    } catch (e) {
      /**
       * Reported rather than thrown, and distinguished from "no match".
       * Telling an admin a transaction isn't ours when we simply could not
       * ask is worse than saying nothing — they would stop looking.
       */
      logger.warn('payment reference lookup: chain unreachable', {
        error: e instanceof Error ? e.message : String(e),
      });
      return { kind, orderId: null, addresses: [], lookupFailed: true };
    }

    for (const address of addresses) {
      const intent = await this.payments.findByAddress(address);
      if (intent) return { kind, orderId: intent.orderId, addresses, lookupFailed: false };
    }

    return { kind, orderId: null, addresses, lookupFailed: false };
  }
}
