import type { UseCase } from '@/shared/application/use-case';
import { logger } from '@/shared/infrastructure/logger';
import type { MarkSupplierOrderOrdered } from './mark-supplier-order-ordered';

export interface BulkMarkSupplierOrdersOrderedInput {
  supplierOrderIds: string[];
  reference: string;
}

export interface BulkMarkSupplierOrdersOrderedResult {
  updated: number;
  failed: number;
}

/** Applies one shared reference (e.g. a combined PO number) to several
 * supplier orders on the same customer order. Composes `MarkSupplierOrderOrdered`
 * per id (rather than the repository directly) so it never needs updating if
 * that use case's transition logic changes. Same per-id try/catch + counters
 * shape as `PublishProducts`/`DeleteProducts`. */
export class BulkMarkSupplierOrdersOrdered
  implements UseCase<BulkMarkSupplierOrdersOrderedInput, BulkMarkSupplierOrdersOrderedResult>
{
  constructor(private readonly markSupplierOrderOrdered: MarkSupplierOrderOrdered) {}

  async execute(input: BulkMarkSupplierOrdersOrderedInput): Promise<BulkMarkSupplierOrdersOrderedResult> {
    let updated = 0;
    let failed = 0;

    for (const supplierOrderId of input.supplierOrderIds) {
      try {
        const ok = await this.markSupplierOrderOrdered.execute({
          supplierOrderId,
          reference: input.reference,
        });
        if (ok) updated += 1;
        else failed += 1;
      } catch (e) {
        failed += 1;
        logger.warn('failed to bulk mark supplier order ordered', {
          supplierOrderId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return { updated, failed };
  }
}
