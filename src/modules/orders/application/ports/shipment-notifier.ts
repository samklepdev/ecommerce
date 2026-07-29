/**
 * Tells the customer their parcel is moving, with the tracking number the
 * payment-confirmed email promised within 24–48 hours.
 *
 * A port on the orders module rather than a direct email call: the use case
 * that marks a supplier order shipped has no business knowing what a mail
 * template looks like, and the same event will want a second channel one
 * day.
 */
export interface ShipmentNotifier {
  /** Called once per supplier order that ships. Implementations must not
   * throw into the caller — a failed email cannot undo a shipment that has
   * already happened. */
  notifyShipped(orderId: string): Promise<void>;
}
