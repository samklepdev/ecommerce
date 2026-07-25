import type { UseCase } from '@/shared/application/use-case';
import { logger } from '@/shared/infrastructure/logger';
import type { CancelSupplierOrder } from './cancel-supplier-order';

export interface BulkCancelSupplierOrdersInput {
  supplierOrderIds: string[];
  orderId: string;
}

export interface BulkCancelSupplierOrdersResult {
  updated: number;
  failed: number;
}

/** Cancels several supplier orders on the same customer order at once.
 * Composes `CancelSupplierOrder` per id so the "advance the order once every
 * sibling is cancelled" cascade stays in exactly one place. */
export class BulkCancelSupplierOrders
  implements UseCase<BulkCancelSupplierOrdersInput, BulkCancelSupplierOrdersResult>
{
  constructor(private readonly cancelSupplierOrder: CancelSupplierOrder) {}

  async execute(input: BulkCancelSupplierOrdersInput): Promise<BulkCancelSupplierOrdersResult> {
    let updated = 0;
    let failed = 0;

    for (const supplierOrderId of input.supplierOrderIds) {
      try {
        const { cancelled } = await this.cancelSupplierOrder.execute({
          supplierOrderId,
          orderId: input.orderId,
        });
        if (cancelled) updated += 1;
        else failed += 1;
      } catch (e) {
        failed += 1;
        logger.warn('failed to bulk cancel supplier order', {
          supplierOrderId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return { updated, failed };
  }
}
