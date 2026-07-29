import { describe, expect, it } from 'vitest';

import { UpdateSupplierOrderTrackingNumber } from './update-supplier-order-tracking-number';
import type { SupplierOrderRepository } from '@/modules/orders/application/ports/supplier-order-repository';

/** `existing` is what the row already holds, so the fake can report whether
 * the edit actually changed the number — the thing the use case keys off. */
function makeFakeSupplierOrders(existing: { orderId: string; trackingNumber: string | null } | null) {
  const calls: { supplierOrderId: string; trackingNumber: string; carrier?: string | null }[] = [];
  const repo: Partial<SupplierOrderRepository> = {
    async updateTrackingNumber(supplierOrderId, trackingNumber, carrier) {
      calls.push({ supplierOrderId, trackingNumber, carrier });
      if (!existing) return null;
      return {
        orderId: existing.orderId,
        trackingNumberChanged: existing.trackingNumber !== trackingNumber,
      };
    },
  };
  return { repo: repo as SupplierOrderRepository, calls };
}

function makeFakeNotifier() {
  const notified: string[] = [];
  return {
    notifier: { async notifyShipped(orderId: string) { notified.push(orderId); } },
    notified,
  };
}

describe('UpdateSupplierOrderTrackingNumber', () => {
  it('delegates to the repository', async () => {
    const { repo, calls } = makeFakeSupplierOrders({ orderId: 'order-1', trackingNumber: 'OLD' });
    const { notifier } = makeFakeNotifier();

    await new UpdateSupplierOrderTrackingNumber(repo, notifier).execute({
      supplierOrderId: 'so-1',
      trackingNumber: '1Z999',
    });

    expect(calls).toEqual([{ supplierOrderId: 'so-1', trackingNumber: '1Z999', carrier: undefined }]);
  });

  // The wrong number is already in the customer's inbox and it's the only
  // thing they can act on, so a correction has to reach them.
  it('re-sends the shipment email when the number itself changed', async () => {
    const { repo } = makeFakeSupplierOrders({ orderId: 'order-1', trackingNumber: 'TYPO' });
    const { notifier, notified } = makeFakeNotifier();

    await new UpdateSupplierOrderTrackingNumber(repo, notifier).execute({
      supplierOrderId: 'so-1',
      trackingNumber: '1Z999',
    });

    expect(notified).toEqual(['order-1']);
  });

  // A second email about a parcel they already know is moving teaches people
  // to ignore the ones that matter.
  it('stays quiet when only the carrier was corrected', async () => {
    const { repo } = makeFakeSupplierOrders({ orderId: 'order-1', trackingNumber: '1Z999' });
    const { notifier, notified } = makeFakeNotifier();

    await new UpdateSupplierOrderTrackingNumber(repo, notifier).execute({
      supplierOrderId: 'so-1',
      trackingNumber: '1Z999',
      carrier: 'ups',
    });

    expect(notified).toEqual([]);
  });

  it('stays quiet when the supplier order no longer exists', async () => {
    const { repo } = makeFakeSupplierOrders(null);
    const { notifier, notified } = makeFakeNotifier();

    await new UpdateSupplierOrderTrackingNumber(repo, notifier).execute({
      supplierOrderId: 'gone',
      trackingNumber: '1Z999',
    });

    expect(notified).toEqual([]);
  });
});
