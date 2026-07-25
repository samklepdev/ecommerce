import { describe, expect, it } from 'vitest';

import { BulkMarkSupplierOrdersOrdered } from './bulk-mark-supplier-orders-ordered';
import { MarkSupplierOrderOrdered } from './mark-supplier-order-ordered';
import type { SupplierOrderRepository } from '@/modules/orders/application/ports/supplier-order-repository';

function makeMarkOrdered(failingIds: Set<string>, guardedFalseIds: Set<string> = new Set()) {
  const marked: { supplierOrderId: string; reference: string }[] = [];
  const repo: Partial<SupplierOrderRepository> = {
    async markOrdered(supplierOrderId, reference) {
      if (failingIds.has(supplierOrderId)) throw new Error('db restrict');
      if (guardedFalseIds.has(supplierOrderId)) return false;
      marked.push({ supplierOrderId, reference });
      return true;
    },
  };
  return { markOrdered: new MarkSupplierOrderOrdered(repo as SupplierOrderRepository), marked };
}

describe('BulkMarkSupplierOrdersOrdered', () => {
  it('marks every selected supplier order and reports zero failures', async () => {
    const { markOrdered, marked } = makeMarkOrdered(new Set());

    const result = await new BulkMarkSupplierOrdersOrdered(markOrdered).execute({
      supplierOrderIds: ['so1', 'so2'],
      reference: 'PO-100',
    });

    expect(result).toEqual({ updated: 2, failed: 0 });
    expect(marked).toEqual([
      { supplierOrderId: 'so1', reference: 'PO-100' },
      { supplierOrderId: 'so2', reference: 'PO-100' },
    ]);
  });

  it('continues past a failure and counts it separately, not stopping the batch', async () => {
    const { markOrdered, marked } = makeMarkOrdered(new Set(['so2']));

    const result = await new BulkMarkSupplierOrdersOrdered(markOrdered).execute({
      supplierOrderIds: ['so1', 'so2', 'so3'],
      reference: 'PO-100',
    });

    expect(result).toEqual({ updated: 2, failed: 1 });
    expect(marked).toEqual([
      { supplierOrderId: 'so1', reference: 'PO-100' },
      { supplierOrderId: 'so3', reference: 'PO-100' },
    ]);
  });

  it('counts a guarded false (e.g. already ordered) as a failure, not an update', async () => {
    const { markOrdered, marked } = makeMarkOrdered(new Set(), new Set(['so2']));

    const result = await new BulkMarkSupplierOrdersOrdered(markOrdered).execute({
      supplierOrderIds: ['so1', 'so2'],
      reference: 'PO-100',
    });

    expect(result).toEqual({ updated: 1, failed: 1 });
    expect(marked).toEqual([{ supplierOrderId: 'so1', reference: 'PO-100' }]);
  });

  it('does nothing for an empty id list', async () => {
    const { markOrdered } = makeMarkOrdered(new Set());

    const result = await new BulkMarkSupplierOrdersOrdered(markOrdered).execute({
      supplierOrderIds: [],
      reference: 'PO-100',
    });

    expect(result).toEqual({ updated: 0, failed: 0 });
  });
});
