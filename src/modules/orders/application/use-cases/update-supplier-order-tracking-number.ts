import type { UseCase } from '@/shared/application/use-case';
import type { SupplierOrderRepository } from '@/modules/orders/application/ports/supplier-order-repository';
import type { ShipmentNotifier } from '@/modules/orders/application/ports/shipment-notifier';

export interface UpdateSupplierOrderTrackingNumberInput {
  supplierOrderId: string;
  trackingNumber: string;
  carrier?: string | null;
}

/**
 * Edits an already-set tracking number — distinct from
 * `MarkSupplierOrderShipped`, which also transitions the status.
 *
 * Re-sends the shipment email **only when the number itself changed**. A
 * corrected number has to reach the customer, because the wrong one is
 * already sitting in their inbox and it's the only thing they can act on.
 * Fixing just the carrier dropdown doesn't: they'd get a second email about
 * a parcel they already know is moving, and emails that say nothing new are
 * how customers learn to ignore the ones that do.
 */
export class UpdateSupplierOrderTrackingNumber
  implements UseCase<UpdateSupplierOrderTrackingNumberInput, void>
{
  constructor(
    private readonly supplierOrders: SupplierOrderRepository,
    private readonly notifier: ShipmentNotifier,
  ) {}

  async execute(input: UpdateSupplierOrderTrackingNumberInput): Promise<void> {
    const result = await this.supplierOrders.updateTrackingNumber(
      input.supplierOrderId,
      input.trackingNumber,
      input.carrier,
    );
    if (!result?.trackingNumberChanged) return;

    // The notifier reads the order's shipped parcels itself, so a supplier
    // order still awaiting dispatch produces no email — editing a number
    // before it ships stays silent, which is right.
    await this.notifier.notifyShipped(result.orderId);
  }
}
