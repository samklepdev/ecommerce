import { logger } from '@/shared/infrastructure/logger';
import { buildCarrierTrackingUrl, carrierLabel } from '@/shared/domain/carrier-tracking';
import { renderShipmentEmailHtml } from '@/modules/notifications/application/order-email-templates';
import type { EmailSender } from '@/modules/notifications/application/ports/email-sender';
import type { OrderHistoryRepository } from '@/modules/orders/application/ports/order-history-repository';
import type {
  SupplierOrderRepository,
} from '@/modules/orders/application/ports/supplier-order-repository';
import type { ShipmentNotifier } from '@/modules/orders/application/ports/shipment-notifier';

/**
 * Reads the order's shipments itself rather than taking the one that just
 * shipped, so the email always shows everything dispatched so far. A
 * customer whose order split across two suppliers should see both numbers in
 * the second email, not have to dig out the first.
 *
 * Never throws: a shipment has already happened by the time this runs, and
 * failing the admin's action because a mail server hiccupped would leave the
 * parcel moving and the record saying otherwise.
 */
export class EmailShipmentNotifier implements ShipmentNotifier {
  constructor(
    private readonly orderHistory: OrderHistoryRepository,
    private readonly supplierOrders: SupplierOrderRepository,
    private readonly emailSender: EmailSender,
    private readonly appUrl: string,
  ) {}

  async notifyShipped(orderId: string): Promise<void> {
    try {
      const order = await this.orderHistory.findById(orderId);
      if (!order) return;

      const all = await this.supplierOrders.listByOrderId(orderId);
      const shipped = all.filter((s) => s.status === 'shipped' && s.trackingNumber);
      if (shipped.length === 0) return;

      const html = renderShipmentEmailHtml({
        orderId: order.id,
        orderUrl: `${this.appUrl}/orders/${order.id}`,
        isComplete: shipped.length === all.length,
        shipments: shipped.map((s) => ({
          trackingNumber: s.trackingNumber!,
          carrierLabel: carrierLabel(s.carrier),
          trackingUrl: buildCarrierTrackingUrl(s.carrier, s.trackingNumber!),
          items: s.lines.map((l) => l.sku).join(', '),
        })),
      });

      await this.emailSender.send(order.customerEmail, 'Your order has shipped', html);
    } catch (e) {
      logger.error('shipment email failed', {
        orderId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
