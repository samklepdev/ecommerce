import { describe, expect, it } from 'vitest';

import { CancelSupplierOrder } from './cancel-supplier-order';
import type { SupplierOrderRepository } from '@/modules/orders/application/ports/supplier-order-repository';

function makeFakeSupplierOrders(cancelResult: boolean) {
  const repo: Partial<SupplierOrderRepository> = {
    async cancel() {
      return cancelResult;
    },
  };
  return repo as SupplierOrderRepository;
}

describe('CancelSupplierOrder', () => {
  it('returns cancelled: true on a successful guarded cancel', async () => {
    const repo = makeFakeSupplierOrders(true);
    const result = await new CancelSupplierOrder(repo).execute({ supplierOrderId: 'so-1' });
    expect(result).toEqual({ cancelled: true });
  });

  it('returns cancelled: false when the guard rejects (already shipped/cancelled)', async () => {
    const repo = makeFakeSupplierOrders(false);
    const result = await new CancelSupplierOrder(repo).execute({ supplierOrderId: 'so-1' });
    expect(result).toEqual({ cancelled: false });
  });
});
