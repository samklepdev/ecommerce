import { describe, expect, it } from 'vitest';

import { MarkSupplierOrderOrdered } from './mark-supplier-order-ordered';
import type { SupplierOrderRepository } from '@/modules/orders/application/ports/supplier-order-repository';

function makeFakeSupplierOrders(markOrderedResult: boolean) {
  const calls: { supplierOrderId: string; reference: string }[] = [];
  const repo: Partial<SupplierOrderRepository> = {
    async markOrdered(supplierOrderId, reference) {
      calls.push({ supplierOrderId, reference });
      return markOrderedResult;
    },
  };
  return { repo: repo as SupplierOrderRepository, calls };
}

describe('MarkSupplierOrderOrdered', () => {
  it('delegates to the repository and returns its result on success', async () => {
    const { repo, calls } = makeFakeSupplierOrders(true);
    const result = await new MarkSupplierOrderOrdered(repo).execute({
      supplierOrderId: 'so-1',
      reference: 'PO-123',
    });
    expect(result).toBe(true);
    expect(calls).toEqual([{ supplierOrderId: 'so-1', reference: 'PO-123' }]);
  });

  it('returns false when the guarded update rejects (not currently needs_ordering)', async () => {
    const { repo } = makeFakeSupplierOrders(false);
    const result = await new MarkSupplierOrderOrdered(repo).execute({
      supplierOrderId: 'so-1',
      reference: 'PO-123',
    });
    expect(result).toBe(false);
  });
});
