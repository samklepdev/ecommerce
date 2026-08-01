import { describe, expect, it } from 'vitest';

import { EditOrderLines } from './edit-order-lines';
import { Product } from '@/modules/catalog/domain/product';
import { Slug } from '@/modules/catalog/domain/slug';
import { Money } from '@/shared/domain/money';
import { isErr, isOk, ok, err } from '@/shared/domain/result';
import type {
  EditableOrder,
  EditableOrderLine,
  OrderEditRepository,
} from '@/modules/orders/application/ports/order-edit-repository';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';
import type { PaymentGateway } from '@/modules/payments/application/ports/payment-gateway';
import type { PaymentStatus } from '@/modules/orders/domain/order-status';

function makeOrder(overrides: Partial<EditableOrder> = {}): EditableOrder {
  return {
    id: 'order-1',
    currency: 'USD',
    paymentStatus: 'awaiting_payment',
    fulfillmentStatus: 'unfulfilled',
    shippingAmountMinor: 500,
    discountAmountMinor: 0,
    lines: [
      { id: 'line-1', productId: 'prod-1', productName: 'Widget One', quantity: 2, unitAmountMinor: 1000 },
      { id: 'line-2', productId: 'prod-2', productName: 'Widget Two', quantity: 1, unitAmountMinor: 2500 },
    ],
    ...overrides,
  };
}

function makeFakeOrders(order: EditableOrder | null) {
  const writes: { lines: EditableOrderLine[]; amountMinor: number }[] = [];
  const windows: Date[] = [];
  const repo: OrderEditRepository = {
    async getEditable() {
      return order;
    },
    async updateContact() {},
    async replaceLines(_orderId, lines, amountMinor) {
      writes.push({ lines, amountMinor });
    },
    async setPaymentWindow(_orderId, expiresAt) {
      windows.push(expiresAt);
    },
  };
  return { repo, writes, windows };
}

function makeFakeProducts(products: Product[]) {
  const repo: Partial<ProductRepository> = {
    async findAnyById(productId) {
      return products.find((p) => p.id === productId) ?? null;
    },
  };
  return repo as ProductRepository;
}

function makeProduct(id: string, amountMinor: number, currency = 'USD') {
  return Product.create({
    id,
    slug: Slug.create(`widget-${id}`),
    name: 'Widget',
    description: null,
    status: 'active',
    price: Money.of(amountMinor, currency),
  });
}

const QUOTE_EXPIRY = new Date('2026-07-28T12:15:00.000Z');

function makeFakeGateway(outcome: 'ok' | 'not_repriceable' = 'ok') {
  const calls: { orderId: string; amountMinor: number }[] = [];
  const gateway: PaymentGateway = {
    method: 'crypto',
    async createPayment() {
      throw new Error('not used');
    },
    async repricePayment(input) {
      calls.push({ orderId: input.orderId, amountMinor: input.amount.amountMinor });
      if (outcome === 'not_repriceable') return err({ code: 'payment_not_repriceable' });
      return ok({
        expiresAt: QUOTE_EXPIRY,
        expectedSats: Math.round((input.amount.amountMinor / 100) * 1000),
      });
    },
  };
  return { gateway, calls };
}

describe('EditOrderLines', () => {
  /**
   * The audit's negative-total case. A coupon is clamped to the subtotal at
   * PlaceOrder time and then snapshotted; shrinking the order afterwards leaves
   * a discount larger than what's left to discount.
   *
   * Decided: refuse the edit outright rather than silently re-clamping. The
   * admin asked for something that doesn't make sense, and quietly changing the
   * discount they can see on screen would be its own surprise.
   */
  it('refuses an edit that would drive the total below zero', async () => {
    // 2 x 2500 = 5000 subtotal, $50 coupon clamped to 5000, 500 shipping.
    const order = makeOrder({
      shippingAmountMinor: 500,
      discountAmountMinor: 5000,
      lines: [
        { id: 'line-1', productId: 'prod-1', productName: 'Widget One', quantity: 2, unitAmountMinor: 2500 },
      ],
    });
    const { repo: orders, writes } = makeFakeOrders(order);
    const products = makeFakeProducts([makeProduct('prod-1', 2500)]);
    const { gateway: payments } = makeFakeGateway();

    // Drop to one: 2500 + 500 - 5000 = -2000.
    const result = await new EditOrderLines(orders, products, payments).execute({
      orderId: 'order-1',
      op: 'set_quantity',
      orderLineId: 'line-1',
      quantity: 1,
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.code).toBe('total_not_payable');
    // Nothing written: no negative amount_minor, and no negative-sats re-quote.
    expect(writes).toEqual([]);
  });

  it('refuses an edit that would make the total exactly zero', async () => {
    // A 0-sat invoice is unpayable — the watcher's `confirmedSats > 0` never
    // fires — so the order would sit until it expired, having burned an address.
    const order = makeOrder({
      shippingAmountMinor: 0,
      discountAmountMinor: 2500,
      lines: [
        { id: 'line-1', productId: 'prod-1', productName: 'Widget One', quantity: 2, unitAmountMinor: 2500 },
      ],
    });
    const { repo: orders, writes } = makeFakeOrders(order);
    const products = makeFakeProducts([makeProduct('prod-1', 2500)]);

    const result = await new EditOrderLines(orders, products, makeFakeGateway().gateway).execute({
      orderId: 'order-1',
      op: 'set_quantity',
      orderLineId: 'line-1',
      quantity: 1,
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.code).toBe('total_not_payable');
    expect(writes).toEqual([]);
  });

  it('still allows an edit that leaves a payable total', async () => {
    const order = makeOrder({
      shippingAmountMinor: 500,
      discountAmountMinor: 1000,
      lines: [
        { id: 'line-1', productId: 'prod-1', productName: 'Widget One', quantity: 2, unitAmountMinor: 2500 },
      ],
    });
    const { repo: orders, writes } = makeFakeOrders(order);
    const products = makeFakeProducts([makeProduct('prod-1', 2500)]);

    const result = await new EditOrderLines(orders, products, makeFakeGateway().gateway).execute({
      orderId: 'order-1',
      op: 'set_quantity',
      orderLineId: 'line-1',
      quantity: 1,
    });

    expect(isErr(result)).toBe(false);
    expect(writes[0]?.amountMinor).toBe(2000); // 2500 + 500 - 1000
  });

  describe('while the order is still unpaid', () => {
    it('changes a line quantity and rewrites the total with it', async () => {
      const { repo, writes } = makeFakeOrders(makeOrder());
      const { gateway } = makeFakeGateway();

      const result = await new EditOrderLines(repo, makeFakeProducts([]), gateway).execute({
        orderId: 'order-1',
        op: 'set_quantity',
        orderLineId: 'line-1',
        quantity: 5,
      });

      expect(isOk(result)).toBe(true);
      // 5 × 1000 + 1 × 2500 + 500 shipping
      expect(writes[0]?.amountMinor).toBe(8000);
      expect(writes[0]?.lines.find((l) => l.id === 'line-1')?.quantity).toBe(5);
      if (isOk(result)) expect(result.value.totalMinor).toBe(8000);
    });

    it('removes a line when its quantity goes to zero', async () => {
      const { repo, writes } = makeFakeOrders(makeOrder());
      const { gateway } = makeFakeGateway();

      await new EditOrderLines(repo, makeFakeProducts([]), gateway).execute({
        orderId: 'order-1',
        op: 'set_quantity',
        orderLineId: 'line-1',
        quantity: 0,
      });

      expect(writes[0]?.lines.map((l) => l.id)).toEqual(['line-2']);
      expect(writes[0]?.amountMinor).toBe(3000); // 2500 + 500 shipping
    });

    // An order with no lines has nothing to fulfil and no meaningful total.
    it('refuses to remove the last line', async () => {
      const order = makeOrder({
        lines: [{ id: 'line-1', productId: 'prod-1', productName: 'Widget One', quantity: 1, unitAmountMinor: 1000 }],
      });
      const { repo, writes } = makeFakeOrders(order);
      const { gateway } = makeFakeGateway();

      const result = await new EditOrderLines(repo, makeFakeProducts([]), gateway).execute({
        orderId: 'order-1',
        op: 'set_quantity',
        orderLineId: 'line-1',
        quantity: 0,
      });

      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error.code).toBe('last_line');
      expect(writes).toHaveLength(0);
    });

    it('adds a product at the catalog price, never a supplied one', async () => {
      const { repo, writes } = makeFakeOrders(makeOrder());
      const { gateway } = makeFakeGateway();
      const products = makeFakeProducts([makeProduct('prod-9', 3300)]);

      await new EditOrderLines(repo, products, gateway).execute({
        orderId: 'order-1',
        op: 'add_product',
        productId: 'prod-9',
        quantity: 2,
      });

      const added = writes[0]?.lines.find((l) => l.productId === 'prod-9');
      expect(added).toMatchObject({ id: null, unitAmountMinor: 3300, quantity: 2 });
      // 2×1000 + 2500 + 2×3300 + 500
      expect(writes[0]?.amountMinor).toBe(11600);
    });

    it('bumps the existing line when the product is already on the order', async () => {
      const { repo, writes } = makeFakeOrders(makeOrder());
      const { gateway } = makeFakeGateway();
      const products = makeFakeProducts([makeProduct('prod-1', 1000)]);

      await new EditOrderLines(repo, products, gateway).execute({
        orderId: 'order-1',
        op: 'add_product',
        productId: 'prod-1',
        quantity: 3,
      });

      expect(writes[0]?.lines).toHaveLength(2);
      expect(writes[0]?.lines.find((l) => l.productId === 'prod-1')?.quantity).toBe(5);
    });

    it('rejects a product priced in another currency', async () => {
      const { repo, writes } = makeFakeOrders(makeOrder());
      const { gateway } = makeFakeGateway();
      const products = makeFakeProducts([makeProduct('prod-eur', 1000, 'EUR')]);

      const result = await new EditOrderLines(repo, products, gateway).execute({
        orderId: 'order-1',
        op: 'add_product',
        productId: 'prod-eur',
        quantity: 1,
      });

      expect(isErr(result)).toBe(true);
      expect(writes).toHaveLength(0);
    });

    it('keeps the shipping and discount snapshots out of the recalculation', async () => {
      const { repo, writes } = makeFakeOrders(
        makeOrder({ shippingAmountMinor: 900, discountAmountMinor: 400 }),
      );
      const { gateway } = makeFakeGateway();

      await new EditOrderLines(repo, makeFakeProducts([]), gateway).execute({
        orderId: 'order-1',
        op: 'set_quantity',
        orderLineId: 'line-2',
        quantity: 2,
      });

      // 2×1000 + 2×2500 + 900 − 400
      expect(writes[0]?.amountMinor).toBe(7500);
    });
  });

  describe('the payment that goes with it', () => {
    it('re-quotes the payment against the new total', async () => {
      const { repo, windows } = makeFakeOrders(makeOrder());
      const { gateway, calls } = makeFakeGateway();

      const result = await new EditOrderLines(repo, makeFakeProducts([]), gateway).execute({
        orderId: 'order-1',
        op: 'set_quantity',
        orderLineId: 'line-1',
        quantity: 5,
      });

      expect(calls).toEqual([{ orderId: 'order-1', amountMinor: 8000 }]);
      if (isOk(result)) expect(result.value.repricedSats).toBe(80_000);
      // The payment window moves with the new quote, or ExpireStaleCheckouts
      // would expire the order against the old one.
      expect(windows).toEqual([QUOTE_EXPIRY]);
    });

    // The lines are already committed by then. Failing silently would leave
    // an order whose payment asks for the old amount.
    it('reports a failed re-quote instead of swallowing it', async () => {
      const { repo, writes } = makeFakeOrders(makeOrder());
      const { gateway } = makeFakeGateway('not_repriceable');

      const result = await new EditOrderLines(repo, makeFakeProducts([]), gateway).execute({
        orderId: 'order-1',
        op: 'set_quantity',
        orderLineId: 'line-1',
        quantity: 5,
      });

      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error.code).toBe('reprice_failed');
      expect(writes).toHaveLength(1);
    });
  });

  describe('once the chain has seen money', () => {
    const locked: PaymentStatus[] = [
      'awaiting_confirmation',
      'paid',
      'failed',
      'expired',
      'cancelled',
    ];

    it.each(locked)('refuses to touch the lines of a %s order', async (paymentStatus) => {
      const { repo, writes } = makeFakeOrders(makeOrder({ paymentStatus }));
      const { gateway, calls } = makeFakeGateway();

      const result = await new EditOrderLines(repo, makeFakeProducts([]), gateway).execute({
        orderId: 'order-1',
        op: 'set_quantity',
        orderLineId: 'line-1',
        quantity: 5,
      });

      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error.code).toBe('lines_locked');
      expect(writes).toHaveLength(0);
      expect(calls).toHaveLength(0);
    });
  });

  it('reports a missing order rather than writing anything', async () => {
    const { repo, writes } = makeFakeOrders(null);
    const { gateway } = makeFakeGateway();

    const result = await new EditOrderLines(repo, makeFakeProducts([]), gateway).execute({
      orderId: 'nope',
      op: 'set_quantity',
      orderLineId: 'line-1',
      quantity: 1,
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.code).toBe('order_not_found');
    expect(writes).toHaveLength(0);
  });
});
