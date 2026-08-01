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

function makeOffer(productId: string, supplierId: string, costMinor: number) {
  return SupplierOffer.create({
    id: randomUUID(),
    productId,
    supplierId,
    supplierProductUrl: 'https://supplier.example.com/x',
    cost: Money.of(costMinor, 'USD'),
    isAvailable: true,
    isPreferred: true,
  });
}

function makeFakeOrderLines(lines: PaidOrderLine[]) {
  const flagged: { orderLineId: string; reason: string }[] = [];
  const cleared: string[] = [];
  const repo: PaidOrderLinesRepository = {
    async getUnsourcedOrderLines() {
      return lines;
    },
    async flagFulfillmentIssue(orderLineId, reason) {
      flagged.push({ orderLineId, reason });
    },
    async clearFulfillmentIssue(orderLineId) {
      cleared.push(orderLineId);
    },
  };
  return { repo, flagged, cleared };
}

function makeFakeSupplierOffers(offersByProductId: Map<string, SupplierOffer>) {
  const repo: Partial<SupplierOfferRepository> = {
    async findSourceableByProductId(productId) {
      return offersByProductId.get(productId) ?? null;
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
  it('groups lines by supplier into one supplier order per distinct supplier', async () => {
    const productA = randomUUID();
    const productB = randomUUID();
    const productC = randomUUID();
    const lines: PaidOrderLine[] = [
      { id: 'line-a', productId: productA, quantity: 1 },
      { id: 'line-b', productId: productB, quantity: 2 },
      { id: 'line-c', productId: productC, quantity: 1 },
    ];
    const { repo: orders } = makeFakeOrderLines(lines);
    const offers = makeFakeSupplierOffers(
      new Map([
        [productA, makeOffer(productA, 'supplier-1', 1000)],
        [productB, makeOffer(productB, 'supplier-1', 2000)], // same supplier as A
        [productC, makeOffer(productC, 'supplier-2', 500)],
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

  it('skips lines whose product has no supplier offer, logging a warning', async () => {
    const productA = randomUUID();
    const productNoOffer = randomUUID();
    const lines: PaidOrderLine[] = [
      { id: 'line-a', productId: productA, quantity: 1 },
      { id: 'line-b', productId: productNoOffer, quantity: 1 },
    ];
    const { repo: orders, flagged } = makeFakeOrderLines(lines);
    const offers = makeFakeSupplierOffers(new Map([[productA, makeOffer(productA, 'supplier-1', 1000)]]));
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
      expect.objectContaining({ orderId: 'order-1', orderLineId: 'line-b', productId: productNoOffer }),
    );
    warnSpy.mockRestore();

    // Durable record, not just a log line — an admin can query for this later.
    expect(flagged).toEqual([{ orderLineId: 'line-b', reason: 'no_supplier_offer' }]);
  });

  it('advances the order to processing when it was unfulfilled', async () => {
    const productA = randomUUID();
    const { repo: orders } = makeFakeOrderLines([{ id: 'line-a', productId: productA, quantity: 1 }]);
    const offers = makeFakeSupplierOffers(new Map([[productA, makeOffer(productA, 'supplier-1', 1000)]]));
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

  it('does nothing when no line has a supplier offer (no supplier orders created, no advancement)', async () => {
    const productA = randomUUID();
    const { repo: orders } = makeFakeOrderLines([{ id: 'line-a', productId: productA, quantity: 1 }]);
    const offers = makeFakeSupplierOffers(new Map()); // no offers at all
    const { repo: supplierOrders, created } = makeFakeSupplierOrders();
    const { repo: fulfillment, getFulfillment } = makeFakeOrderFulfillment('paid', 'unfulfilled');

    await new CreateSupplierOrdersForPaidOrder(orders, offers, supplierOrders, fulfillment).execute({
      orderId: 'order-1',
    });

    expect(created).toHaveLength(0);
    expect(getFulfillment()).toBe('unfulfilled');
  });

  // A paid order whose lines couldn't be sourced used to be terminal: this
  // ran exactly once, from ConfirmPayment, and adding the missing supplier
  // offer afterwards did nothing. It has to be safe to run again.
  describe('re-run after the missing supplier offer is added', () => {
    it('sources the previously-unsourceable line and clears its issue flag', async () => {
      const productA = randomUUID();
      // Only the still-unsourced line comes back on the second pass; the
      // repository excludes anything a supplier order already covers.
      const { repo: orders, cleared } = makeFakeOrderLines([
        { id: 'line-b', productId: productA, quantity: 3 },
      ]);
      const offers = makeFakeSupplierOffers(new Map([[productA, makeOffer(productA, 'supplier-9', 750)]]));
      const { repo: supplierOrders, created } = makeFakeSupplierOrders();
      const { repo: fulfillment } = makeFakeOrderFulfillment('paid', 'processing');

      await new CreateSupplierOrdersForPaidOrder(orders, offers, supplierOrders, fulfillment).execute({
        orderId: 'order-1',
      });

      expect(created).toHaveLength(1);
      expect(created[0]?.lines).toEqual([
        expect.objectContaining({ orderLineId: 'line-b', quantity: 3 }),
      ]);
      // Otherwise it sits in the admin "needs a supplier offer" queue forever.
      expect(cleared).toEqual(['line-b']);
    });

    it('refuses to source an order that is not paid', async () => {
      const productA = randomUUID();
      const { repo: orders } = makeFakeOrderLines([{ id: 'line-a', productId: productA, quantity: 1 }]);
      const offers = makeFakeSupplierOffers(new Map([[productA, makeOffer(productA, 'supplier-1', 1000)]]));
      const { repo: supplierOrders, created } = makeFakeSupplierOrders();
      // e.g. an admin hitting retry on an order that failed meanwhile.
      const { repo: fulfillment } = makeFakeOrderFulfillment('failed', 'processing');

      await new CreateSupplierOrdersForPaidOrder(orders, offers, supplierOrders, fulfillment).execute({
        orderId: 'order-1',
      });

      expect(created).toHaveLength(0);
    });
  });

  it('does not re-advance an order that already moved past unfulfilled', async () => {
    const productA = randomUUID();
    const { repo: orders } = makeFakeOrderLines([{ id: 'line-a', productId: productA, quantity: 1 }]);
    const offers = makeFakeSupplierOffers(new Map([[productA, makeOffer(productA, 'supplier-1', 1000)]]));
    const { repo: supplierOrders } = makeFakeSupplierOrders();
    const { repo: fulfillment, getFulfillment } = makeFakeOrderFulfillment('paid', 'processing');

    await new CreateSupplierOrdersForPaidOrder(orders, offers, supplierOrders, fulfillment).execute({
      orderId: 'order-1',
    });

    expect(getFulfillment()).toBe('processing'); // unchanged, no illegal re-transition attempted
  });
});
