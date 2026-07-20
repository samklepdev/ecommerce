export interface PaymentConfirmationNotifier {
  notifyPaymentConfirmed(orderId: string): Promise<void>;
}
