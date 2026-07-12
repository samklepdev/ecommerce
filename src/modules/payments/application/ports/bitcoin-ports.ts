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
}

export interface BitcoinPaymentStore {
  save(intent: BitcoinPaymentIntent): Promise<void>;
  getByOrderId(orderId: string): Promise<BitcoinPaymentIntent | null>;
  /** Awaiting intents whose quote hasn't expired — the watcher polls these. */
  listWatchable(): Promise<BitcoinPaymentIntent[]>;
  markConfirmed(orderId: string): Promise<void>;
  markExpired(orderId: string): Promise<void>;
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
