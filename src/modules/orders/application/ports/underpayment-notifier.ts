/**
 * Tells a customer their payment was short, and what's still owed.
 *
 * A port rather than a direct email call, for the same reason as
 * `ShipmentNotifier`: the chain watcher has no business knowing what a mail
 * template looks like.
 *
 * Implementations must not throw for a missing order or intent — the watcher
 * is a background loop, and one unmailable order must not stop it polling the
 * rest.
 */
export interface UnderpaymentNotifier {
  notifyUnderpaid(orderId: string): Promise<void>;
}
