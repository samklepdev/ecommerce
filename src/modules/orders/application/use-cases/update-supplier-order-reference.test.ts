import { describe, expect, it } from 'vitest';

import { UpdateSupplierOrderReference } from './update-supplier-order-reference';
import type { SupplierOrderRepository } from '@/modules/orders/application/ports/supplier-order-repository';

function makeFakeSupplierOrders() {
  const calls: { supplierOrderId: string; reference: string }[] = [];
  const repo: Partial<SupplierOrderRepository> = {
    async updateReference(supplierOrderId, reference) {
      calls.push({ supplierOrderId, reference });
    },
  };
  return { repo: repo as SupplierOrderRepository, calls };
}

describe('UpdateSupplierOrderReference', () => {
  it('delegates to the repository', async () => {
    const { repo, calls } = makeFakeSupplierOrders();

    await new UpdateSupplierOrderReference(repo).execute({ supplierOrderId: 'so-1', reference: 'PO-999' });

    expect(calls).toEqual([{ supplierOrderId: 'so-1', reference: 'PO-999' }]);
  });
});
