export interface AddressIndexAllocator {
  next(): Promise<number>;
  seedFloor(minNextIndex: number): Promise<void>;
}

export type BitcoinPaymentIntentStatus = 'awaiting' | 'confirmed' | 'expired';

export interface BitcoinPaymentIntent {
  orderId: string;
  address: string;
  addressIndex: number;
  expectedSats: number;
  fiatCurrency: string;
  satsPerFiatUnit: number;
  expiresAt: Date;
  status: BitcoinPaymentIntentStatus;
  /** Last confirmation count / underpayment flag the watcher observed —
   * absent at creation time (DB defaults to 0/false), always present once
   * read back via `getByOrderId`/`listWatchable`. */
  confirmations?: number;
  underpaid?: boolean;
}

export interface BitcoinPaymentStore {
  save(intent: BitcoinPaymentIntent): Promise<void>;
  getByOrderId(orderId: string): Promise<BitcoinPaymentIntent | null>;
  /** Awaiting intents whose quote hasn't expired — the watcher polls these. */
  listWatchable(): Promise<BitcoinPaymentIntent[]>;
  markConfirmed(orderId: string): Promise<void>;
  markExpired(orderId: string): Promise<void>;
  /** Auxiliary telemetry for the customer-facing status widget — not a
   * status-enum transition, so it's a distinct method rather than folded
   * into `markConfirmed`/`markExpired`. */
  recordProgress(orderId: string, progress: { confirmations: number; underpaid: boolean }): Promise<void>;
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
