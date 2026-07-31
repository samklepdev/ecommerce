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
  underpaid?: boolean;
  overpaid?: boolean;
}

export interface BitcoinPaymentStore {
  save(intent: BitcoinPaymentIntent): Promise<void>;
  getByOrderId(orderId: string): Promise<BitcoinPaymentIntent | null>;
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
  /** Flags an intent as having received money after it closed. Write-once —
   * re-flagging would reset `latePaymentSeenAt` and make the discovery look
   * newer than it is. */
  recordLatePayment(orderId: string, sats: number): Promise<void>;
  /** How many closed intents have unexplained money against them. Drives the
   * admin dashboard tile; expected to be 0. */
  countLatePayments(): Promise<number>;
}

export interface BtcRateProvider {
  /** Sats per one major unit of `currency` (e.g. sats per 1 USD). */
  satsPerFiatUnit(currency: string): Promise<number>;
}

export interface AddressChainStatus {
  address: string;
  confirmedSats: number;
  confirmations: number;
}

export interface ChainDataProvider {
  getStatus(address: string): Promise<AddressChainStatus>;
}
