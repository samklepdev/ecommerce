import type { UseCase } from '@/shared/application/use-case';
import { logger } from '@/shared/infrastructure/logger';
import type { MarkSupplierOrderShipped } from './mark-supplier-order-shipped';

export interface BulkMarkSupplierOrdersShippedInput {
  supplierOrderIds: string[];
  orderId: string;
  trackingNumber: string;
  carrier?: string | null;
}

export interface BulkMarkSupplierOrdersShippedResult {
  updated: number;
  failed: number;
}

/** Applies one shared tracking number/carrier (e.g. a consolidated shipment)
 * to several supplier orders on the same customer order. Composes
 * `MarkSupplierOrderShipped` per id so the "advance the order once every
 * sibling has shipped" cascade stays in exactly one place. */
export class BulkMarkSupplierOrdersShipped
  implements UseCase<BulkMarkSupplierOrdersShippedInput, BulkMarkSupplierOrdersShippedResult>
{
  constructor(private readonly markSupplierOrderShipped: MarkSupplierOrderShipped) {}

  async execute(input: BulkMarkSupplierOrdersShippedInput): Promise<BulkMarkSupplierOrdersShippedResult> {
    let updated = 0;
    let failed = 0;

    for (const supplierOrderId of input.supplierOrderIds) {
      try {
        const ok = await this.markSupplierOrderShipped.execute({
          supplierOrderId,
          orderId: input.orderId,
          trackingNumber: input.trackingNumber,
          carrier: input.carrier,
        });
        if (ok) updated += 1;
        else failed += 1;
      } catch (e) {
        failed += 1;
        logger.warn('failed to bulk mark supplier order shipped', {
          supplierOrderId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return { updated, failed };
  }
}
