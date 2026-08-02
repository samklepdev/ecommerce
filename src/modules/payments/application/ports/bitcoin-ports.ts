export interface AddressIndexAllocator {
  next(): Promise<number>;
  seedFloor(minNextIndex: number): Promise<void>;
}

export type BitcoinPaymentIntentStatus = 'awaiting' | 'confirmed' | 'expired' | 'cancelled';

export interface BitcoinPaymentIntent {
  orderId: string;
  address: string;
  addressIndex: number;
  expectedSats: number;
  fiatCurrency: string;
  satsPerFiatUnit: number;
  expiresAt: Date;
  status: BitcoinPaymentIntentStatus;
  /** Last confirmation count / observed amount / underpayment-overpayment
   * flags the watcher recorded — absent at creation time (DB defaults to
   * 0/false), always present once read back via
   * `getByOrderId`/`listWatchable`. */
  confirmations?: number;
  /** Satoshis actually seen at `address`, as against `expectedSats`, which is
   * what was asked for. The difference is the whole point: it's what says how
   * short an underpaid order is, and how much an overpaid one sent. */
  confirmedSats?: number;
  /**
   * Satoshis seen at `address` in transactions that have not confirmed yet.
   *
   * Never counts toward settlement — an order must never reach `paid` on
   * mempool value. It exists so the system can tell "they've sent it, it's
   * waiting for a block" apart from "they haven't paid", which is what keeps
   * an in-flight payment from expiring underneath the customer.
   */
  pendingSats?: number;
  underpaid?: boolean;
  overpaid?: boolean;
  /**
   * Money seen at `address` after the order closed, written only by
   * `SweepLatePayments`. Null in the overwhelmingly normal case; non-null
   * means real bitcoin is sitting against an order nobody is expecting to be
   * paid, and it is what `CreditLatePayment` is allowed to credit.
   */
  latePaymentSats?: number | null;
}

export interface BitcoinPaymentStore {
  save(intent: BitcoinPaymentIntent): Promise<void>;
  getByOrderId(orderId: string): Promise<BitcoinPaymentIntent | null>;
  /**
   * The intent that owns an address, or null.
   *
   * One address per order is the whole correlation model, and nothing could
   * search on it — so a customer saying "I sent coins here and nothing
   * happened" had no lookup path. The column is already uniquely indexed, so
   * this is the cheap half of `FindOrderByPaymentReference`.
   */
  findByAddress(address: string): Promise<BitcoinPaymentIntent | null>;
  /** Awaiting intents whose quote hasn't expired — the watcher polls these. */
  listWatchable(): Promise<BitcoinPaymentIntent[]>;
  /** Highest address index ever persisted, or null if none. The DB is the
   * durable record of what the wallet has handed out, so it — not Redis —
   * is the authority when the counter needs rebuilding. */
  highestAddressIndex(): Promise<number | null>;
  markConfirmed(orderId: string): Promise<void>;
  markExpired(orderId: string): Promise<void>;
  /** New amount and quote on the SAME address. Used when an admin edits an
   * unpaid order's lines: a new address would orphan anything already sent
   * to the old one and burn an index for nothing. */
  reprice(
    orderId: string,
    quote: { expectedSats: number; satsPerFiatUnit: number; expiresAt: Date },
  ): Promise<void>;
  markCancelled(orderId: string): Promise<void>;
  /** Auxiliary telemetry for the customer-facing status widget — not a
   * status-enum transition, so it's a distinct method rather than folded
   * into `markConfirmed`/`markExpired`. */
  recordProgress(
    orderId: string,
    progress: {
      confirmations: number;
      confirmedSats: number;
      pendingSats: number;
      underpaid: boolean;
      overpaid: boolean;
    },
  ): Promise<void>;
  /**
   * Closed intents worth one more look: `expired` or `cancelled`, created no
   * earlier than `createdSince`, and not already flagged.
   *
   * The counterpart to `listWatchable`, which deliberately stops returning an
   * intent once its order closes. That's right for the confirmation path — we
   * stop *promising* — but it also means we stop *looking*, and a customer who
   * pays late has still sent real bitcoin to an address we handed them.
   *
   * Bounded by age because an address can't stop existing: without a cutoff
   * this grows into a full wallet rescan on every sweep.
   */
  listSweepable(createdSince: Date): Promise<BitcoinPaymentIntent[]>;
  /**
   * Flags an intent as holding money after its order closed, and reports
   * whether that changed anything.
   *
   * Grow-only: the figure can rise, because a customer told to send a balance
   * may send it after the order closed, but it never falls. Returns false when
   * the amount is unchanged, which is what lets an hourly sweep re-check a
   * known problem without logging it again.
   */
  recordLatePayment(orderId: string, sats: number): Promise<boolean>;
  /** How many closed intents have unexplained money against them. Drives the
   * admin dashboard tile; expected to be 0. */
  countLatePayments(): Promise<number>;
}

export interface BtcRateProvider {
  /** Sats per one major unit of `currency` (e.g. sats per 1 USD). */
  satsPerFiatUnit(currency: string): Promise<number>;
}

/**
 * The last BTC price we were willing to quote from, per currency.
 *
 * Exists so a rate can be sanity-checked against something: the absolute band
 * catches a decimal shift, but only a comparison against the recent past
 * catches a feed that starts returning plausible-but-wrong numbers.
 *
 * Persisted rather than held in memory because the check must survive a
 * restart — a process that boots into a corrupt feed has no history to
 * compare against, which is precisely when it would accept anything.
 *
 * Implementations are expected to expire entries: a reference from weeks ago
 * would reject genuine market movement. Losing it is safe — the absolute band
 * still applies and the shop keeps trading.
 */
export interface LastKnownRateStore {
  /** The last accepted price of one BTC in `currency`, or null. */
  get(currency: string): Promise<number | null>;
  set(currency: string, price: number): Promise<void>;
}

export interface AddressChainStatus {
  address: string;
  confirmedSats: number;
  /**
   * Value seen at the address in still-unconfirmed transactions.
   *
   * Deliberately separate from `confirmedSats`, and nothing that decides
   * settlement may read it — an order must never reach `paid` on mempool
   * value. What it is for is the difference between "we can see it, it just
   * isn't safe yet" and "nothing has arrived", which decides whether an order
   * expires under an in-flight payment and whether a re-quote is allowed.
   */
  pendingSats: number;
  confirmations: number;
}

export interface ChainDataProvider {
  /**
   * `expectedSats` is what the payment is supposed to come to, and is used to
   * work out which transactions constitute the payment — see `coveringDepth`.
   * Without it, depth is measured across every transaction touching the
   * address, which anyone can keep at 1 by sending dust.
   */
  getStatus(address: string, expectedSats: number): Promise<AddressChainStatus>;
}
