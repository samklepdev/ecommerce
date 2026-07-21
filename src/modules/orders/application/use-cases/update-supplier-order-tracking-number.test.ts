import { describe, expect, it } from 'vitest';

import { UpdateSupplierOrderTrackingNumber } from './update-supplier-order-tracking-number';
import type { SupplierOrderRepository } from '@/modules/orders/application/ports/supplier-order-repository';

function makeFakeSupplierOrders() {
  const calls: { supplierOrderId: string; trackingNumber: string }[] = [];
  const repo: Partial<SupplierOrderRepository> = {
    async updateTrackingNumber(supplierOrderId, trackingNumber) {
      calls.push({ supplierOrderId, trackingNumber });
    },
  };
  return { repo: repo as SupplierOrderRepository, calls };
}

describe('UpdateSupplierOrderTrackingNumber', () => {
  it('delegates to the repository', async () => {
    const { repo, calls } = makeFakeSupplierOrders();

    await new UpdateSupplierOrderTrackingNumber(repo).execute({
      supplierOrderId: 'so-1',
      trackingNumber: '1Z999',
    });

    expect(calls).toEqual([{ supplierOrderId: 'so-1', trackingNumber: '1Z999' }]);
  });
});
