export type PaymentProvider = 'onchain_bitcoin';
export type PaymentMethod = 'crypto';

export type PaymentEventType = 'confirmed' | 'underpaid' | 'expired';

/** Normalized on-chain state — the domain never touches bitcoin libraries directly. */
export interface PaymentEvent {
  /** Unique id for de-dup (ConfirmPayment/ProcessedEventStore). */
  id: string;
  orderId: string;
  provider: PaymentProvider;
  type: PaymentEventType;
  confirmedSats?: number;
}
