import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

import { logger } from '@/shared/infrastructure/logger';

import {
  CreateSupplierOrdersForPaidOrder,
  type PaidOrderLine,
  type PaidOrderLinesRepository,
} from './create-supplier-orders-for-paid-order';
import { SupplierOffer } from '@/modules/sourcing/domain/supplier-offer';
import { Money } from '@/shared/domain/money';
import type { SupplierOfferRepository } from '@/modules/sourcing/application/ports/supplier-offer-repository';
import type {
  CreateSupplierOrderInput,
  SupplierOrderRepository,
} from '@/modules/orders/application/ports/supplier-order-repository';
import type { OrderFulfillmentRepository } from '@/modules/orders/application/ports/order-fulfillment-repository';
import type { FulfillmentStatus, PaymentStatus } from '@/modules/orders/domain/order-status';

function makeOffer(variantId: string, supplierId: string, costMinor: number) {
  return SupplierOffer.create({
    id: randomUUID(),
    variantId,
    supplierId,
    supplierProductUrl: 'https://supplier.example.com/x',
    cost: Money.of(costMinor, 'USD'),
    isAvailable: true,
    isPreferred: true,
  });
}

function makeFakeOrderLines(lines: PaidOrderLine[]) {
  const flagged: { orderLineId: string; reason: string }[] = [];
  const repo: PaidOrderLinesRepository = {
    async getOrderLines() {
      return lines;
    },
    async flagFulfillmentIssue(orderLineId, reason) {
      flagged.push({ orderLineId, reason });
    },
  };
  return { repo, flagged };
}

function makeFakeSupplierOffers(offersByVariantId: Map<string, SupplierOffer>) {
  const repo: Partial<SupplierOfferRepository> = {
    async findPreferredByVariantId(variantId) {
      return offersByVariantId.get(variantId) ?? null;
    },
  };
  return repo as SupplierOfferRepository;
}

function makeFakeSupplierOrders() {
  const created: CreateSupplierOrderInput[] = [];
  const repo: Partial<SupplierOrderRepository> = {
    async createForPaidOrder(inputs) {
      created.push(...inputs);
    },
  };
  return { repo: repo as SupplierOrderRepository, created };
}

function makeFakeOrderFulfillment(paymentStatus: PaymentStatus | null, fulfillmentStatus: FulfillmentStatus | null) {
  let current = fulfillmentStatus;
  const repo: OrderFulfillmentRepository = {
    async getPaymentStatus() {
      return paymentStatus;
    },
    async getFulfillmentStatus() {
      return current;
    },
    async setFulfillmentStatus(_orderId, status) {
      current = status;
    },
  };
  return { repo, getFulfillment: () => current };
}

describe('CreateSupplierOrdersForPaidOrder', () => {
  it('groups lines by preferred supplier into one supplier order per distinct supplier', async () => {
    const variantA = randomUUID();
    const variantB = randomUUID();
    const variantC = randomUUID();
    const lines: PaidOrderLine[] = [
      { id: 'line-a', variantId: variantA, quantity: 1 },
      { id: 'line-b', variantId: variantB, quantity: 2 },
      { id: 'line-c', variantId: variantC, quantity: 1 },
    ];
    const { repo: orders } = makeFakeOrderLines(lines);
    const offers = makeFakeSupplierOffers(
      new Map([
        [variantA, makeOffer(variantA, 'supplier-1', 1000)],
        [variantB, makeOffer(variantB, 'supplier-1', 2000)], // same supplier as A
        [variantC, makeOffer(variantC, 'supplier-2', 500)],
      ]),
    );
    const { repo: supplierOrders, created } = makeFakeSupplierOrders();
    const { repo: fulfillment } = makeFakeOrderFulfillment('paid', 'unfulfilled');

    await new CreateSupplierOrdersForPaidOrder(orders, offers, supplierOrders, fulfillment).execute({
      orderId: 'order-1',
    });

    expect(created).toHaveLength(2); // one per distinct supplier
    const supplier1Order = created.find((c) => c.supplierId === 'supplier-1')!;
    expect(supplier1Order.lines).toHaveLength(2); // A and B grouped together
    const supplier2Order = created.find((c) => c.supplierId === 'supplier-2')!;
    expect(supplier2Order.lines).toHaveLength(1);
  });

  it('skips lines whose variant has no preferred supplier offer, logging a warning', async () => {
    const variantA = randomUUID();
    const variantNoOffer = randomUUID();
    const lines: PaidOrderLine[] = [
      { id: 'line-a', variantId: variantA, quantity: 1 },
      { id: 'line-b', variantId: variantNoOffer, quantity: 1 },
    ];
    const { repo: orders, flagged } = makeFakeOrderLines(lines);
    const offers = makeFakeSupplierOffers(new Map([[variantA, makeOffer(variantA, 'supplier-1', 1000)]]));
    const { repo: supplierOrders, created } = makeFakeSupplierOrders();
    const { repo: fulfillment } = makeFakeOrderFulfillment('paid', 'unfulfilled');
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});

    await new CreateSupplierOrdersForPaidOrder(orders, offers, supplierOrders, fulfillment).execute({
      orderId: 'order-1',
    });

    expect(created).toHaveLength(1);
    expect(created[0]?.lines).toHaveLength(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ orderId: 'order-1', orderLineId: 'line-b', variantId: variantNoOffer }),
    );
    warnSpy.mockRestore();

    // Durable record, not just a log line — an admin can query for this later.
    expect(flagged).toEqual([{ orderLineId: 'line-b', reason: 'no_preferred_supplier_offer' }]);
  });

  it('advances the order to processing when it was unfulfilled', async () => {
    const variantA = randomUUID();
    const { repo: orders } = makeFakeOrderLines([{ id: 'line-a', variantId: variantA, quantity: 1 }]);
    const offers = makeFakeSupplierOffers(new Map([[variantA, makeOffer(variantA, 'supplier-1', 1000)]]));
    const { repo: supplierOrders } = makeFakeSupplierOrders();
    const { repo: fulfillment, getFulfillment } = makeFakeOrderFulfillment('paid', 'unfulfilled');

    await new CreateSupplierOrdersForPaidOrder(orders, offers, supplierOrders, fulfillment).execute({
      orderId: 'order-1',
    });

    expect(getFulfillment()).toBe('processing');
  });

  it('does nothing when the order has no lines (dev harness orders)', async () => {
    const { repo: orders } = makeFakeOrderLines([]);
    const offers = makeFakeSupplierOffers(new Map());
    const { repo: supplierOrders, created } = makeFakeSupplierOrders();
    const { repo: fulfillment, getFulfillment } = makeFakeOrderFulfillment('paid', 'unfulfilled');

    await new CreateSupplierOrdersForPaidOrder(orders, offers, supplierOrders, fulfillment).execute({
      orderId: 'order-1',
    });

    expect(created).toHaveLength(0);
    expect(getFulfillment()).toBe('unfulfilled'); // untouched
  });

  it('does nothing when no line has a preferred offer (no supplier orders created, no advancement)', async () => {
    const variantA = randomUUID();
    const { repo: orders } = makeFakeOrderLines([{ id: 'line-a', variantId: variantA, quantity: 1 }]);
    const offers = makeFakeSupplierOffers(new Map()); // no offers at all
    const { repo: supplierOrders, created } = makeFakeSupplierOrders();
    const { repo: fulfillment, getFulfillment } = makeFakeOrderFulfillment('paid', 'unfulfilled');

    await new CreateSupplierOrdersForPaidOrder(orders, offers, supplierOrders, fulfillment).execute({
      orderId: 'order-1',
    });

    expect(created).toHaveLength(0);
    expect(getFulfillment()).toBe('unfulfilled');
  });

  it('does not re-advance an order that already moved past unfulfilled', async () => {
    const variantA = randomUUID();
    const { repo: orders } = makeFakeOrderLines([{ id: 'line-a', variantId: variantA, quantity: 1 }]);
    const offers = makeFakeSupplierOffers(new Map([[variantA, makeOffer(variantA, 'supplier-1', 1000)]]));
    const { repo: supplierOrders } = makeFakeSupplierOrders();
    const { repo: fulfillment, getFulfillment } = makeFakeOrderFulfillment('paid', 'processing');

    await new CreateSupplierOrdersForPaidOrder(orders, offers, supplierOrders, fulfillment).execute({
      orderId: 'order-1',
    });

    expect(getFulfillment()).toBe('processing'); // unchanged, no illegal re-transition attempted
  });
});
