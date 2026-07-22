import { randomUUID } from 'node:crypto';
import { and, eq, ilike, inArray, isNotNull, lt } from 'drizzle-orm';

import type { DB } from '@/shared/infrastructure/db/client';
import { orderLines, orders } from '@/shared/infrastructure/db/schema';
import { Money } from '@/shared/domain/money';
import { PAYMENT_EXPIRY_GRACE_MS } from '@/shared/domain/payment-expiry-grace';
import type { Order } from '@/modules/orders/domain/order';
import type { FulfillmentStatus, PaymentStatus } from '@/modules/orders/domain/order-status';
import type { CheckoutOrderRepository } from '@/modules/checkout/application/ports/checkout-order-repository';
import type { OrderFulfillmentRepository } from '@/modules/orders/application/ports/order-fulfillment-repository';
import type {
  ConfirmPaymentOrderRepository,
  OrderRepository,
} from '@/modules/orders/application/ports/order-repository';
import type { StaleCheckoutOrderRepository } from '@/modules/checkout/application/use-cases/expire-stale-checkouts';
import type {
  PaidOrderLine,
  PaidOrderLinesRepository,
} from '@/modules/orders/application/use-cases/create-supplier-orders-for-paid-order';
import type {
  OrderSummary,
  OrderSummaryRepository,
} from '@/modules/orders/application/ports/order-summary-repository';
import type {
  OrderDetail,
  OrderHistoryRepository,
  OrderListItem,
} from '@/modules/orders/application/ports/order-history-repository';
import type {
  UnfulfillableOrderLine,
  UnfulfillableOrderLinesRepository,
} from '@/modules/orders/application/ports/unfulfillable-order-lines-repository';
import type { CancelOrderRepository } from '@/modules/orders/application/ports/cancel-order-repository';

/**
 * One repository satisfies the place-order, checkout-side, confirm-side,
 * expiry-scan, and fulfillment ports. Orders are the durable payment record,
 * so this is Postgres, not Redis.
 */
export class DrizzleOrderRepository
  implements
    OrderRepository,
    CheckoutOrderRepository,
    ConfirmPaymentOrderRepository,
    StaleCheckoutOrderRepository,
    OrderFulfillmentRepository,
    PaidOrderLinesRepository,
    OrderSummaryRepository,
    OrderHistoryRepository,
    UnfulfillableOrderLinesRepository,
    CancelOrderRepository
{
  constructor(private readonly db: DB) {}

  /** Real production path: persist an order + its lines from a priced cart. */
  async create(order: Order): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.insert(orders).values({
        id: order.id,
        userId: order.userId,
        currency: order.currency,
        amountMinor: order.total.amountMinor,
        shippingAmountMinor: order.shippingAmount.amountMinor,
        paymentStatus: order.paymentStatus,
        fulfillmentStatus: order.fulfillmentStatus,
        customerEmail: order.customerEmail,
        shippingAddress: order.shippingAddress.toJSON(),
      });
      if (order.lines.length > 0) {
        await tx.insert(orderLines).values(
          order.lines.map((line) => ({
            id: randomUUID(),
            orderId: order.id,
            variantId: line.variantId,
            sku: line.sku,
            quantity: line.quantity,
            unitAmountMinor: line.unitPrice.amountMinor,
          })),
        );
      }
    });
  }

  /**
   * DEV ENTRY ONLY — creates a bare order with no lines, for /api/checkout's
   * amount-only harness. Real orders come from `create()` via cart checkout.
   */
  async createDraft(input: {
    id: string;
    amountMinor: number;
    currency: string;
    customerEmail: string;
  }): Promise<void> {
    await this.db.insert(orders).values({
      id: input.id,
      amountMinor: input.amountMinor,
      shippingAmountMinor: 0,
      currency: input.currency,
      customerEmail: input.customerEmail,
      paymentStatus: 'pending',
    });
  }

  /**
   * Re-price server-side from persisted order_lines (populated from the catalog
   * at place-order time, never from client input). Falls back to the persisted
   * total for the dev harness path, which has no lines.
   */
  async repriceAndGetTotal(orderId: string): Promise<Money> {
    const row = await this.db.query.orders.findFirst({ where: eq(orders.id, orderId) });
    if (!row) throw new Error(`order not found: ${orderId}`);

    const lines = await this.db.query.orderLines.findMany({
      where: eq(orderLines.orderId, orderId),
    });
    if (lines.length === 0) {
      return Money.of(row.amountMinor, row.currency);
    }
    return lines.reduce(
      (total, l) => total.add(Money.of(l.unitAmountMinor, row.currency).multiply(l.quantity)),
      Money.of(row.shippingAmountMinor, row.currency),
    );
  }

  async getOrderLines(orderId: string): Promise<PaidOrderLine[]> {
    const rows = await this.db.query.orderLines.findMany({
      where: eq(orderLines.orderId, orderId),
    });
    return rows.map((r) => ({ id: r.id, variantId: r.variantId, quantity: r.quantity }));
  }

  async flagFulfillmentIssue(orderLineId: string, reason: string): Promise<void> {
    await this.db
      .update(orderLines)
      .set({ fulfillmentIssue: reason })
      .where(eq(orderLines.id, orderLineId));
  }

  async listUnfulfillableLines(): Promise<UnfulfillableOrderLine[]> {
    const rows = await this.db.query.orderLines.findMany({
      where: isNotNull(orderLines.fulfillmentIssue),
    });
    return rows.map((r) => ({
      orderLineId: r.id,
      orderId: r.orderId,
      sku: r.sku,
      variantId: r.variantId,
      reason: r.fulfillmentIssue!,
    }));
  }

  async findExpiredAwaitingOrderIds(now: Date): Promise<string[]> {
    // Same grace period as DrizzleBitcoinPaymentStore.listWatchable's
    // continued-polling window — an order must never be expired while its
    // payment intent might still be found by the watcher.
    const cutoff = new Date(now.getTime() - PAYMENT_EXPIRY_GRACE_MS);
    const rows = await this.db.query.orders.findMany({
      where: and(
        inArray(orders.paymentStatus, ['pending', 'awaiting_payment']),
        lt(orders.paymentWindowExpiresAt, cutoff),
      ),
      columns: { id: true },
    });
    return rows.map((r) => r.id);
  }

  /** Guarded, idempotent: returns false if another pass already expired this order. */
  async tryExpire(orderId: string): Promise<boolean> {
    const result = await this.db
      .update(orders)
      .set({ paymentStatus: 'expired', updatedAt: new Date() })
      .where(
        and(eq(orders.id, orderId), inArray(orders.paymentStatus, ['pending', 'awaiting_payment'])),
      )
      .returning({ id: orders.id });
    return result.length > 0;
  }

  /** Guarded, idempotent, same shape as `tryExpire` — `ownerUserId: null`
   * skips the ownership filter entirely (the guest order page's existing
   * trust model: order id alone is the access capability). */
  async cancelOrder(orderId: string, ownerUserId: string | null): Promise<boolean> {
    const result = await this.db
      .update(orders)
      .set({ paymentStatus: 'cancelled', updatedAt: new Date() })
      .where(
        and(
          eq(orders.id, orderId),
          inArray(orders.paymentStatus, ['pending', 'awaiting_payment']),
          ownerUserId === null ? undefined : eq(orders.userId, ownerUserId),
        ),
      )
      .returning({ id: orders.id });
    return result.length > 0;
  }

  async markAwaitingPayment(
    orderId: string,
    reference: string,
    paymentWindowExpiresAt: Date,
  ): Promise<void> {
    await this.db
      .update(orders)
      .set({
        paymentStatus: 'awaiting_payment',
        paymentReference: reference,
        paymentWindowExpiresAt,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId));
  }

  async getPaymentStatus(orderId: string): Promise<PaymentStatus | null> {
    const row = await this.db.query.orders.findFirst({
      where: eq(orders.id, orderId),
      columns: { paymentStatus: true },
    });
    return row ? (row.paymentStatus as PaymentStatus) : null;
  }

  async setPaymentStatus(orderId: string, status: PaymentStatus): Promise<void> {
    await this.db
      .update(orders)
      .set({ paymentStatus: status, updatedAt: new Date() })
      .where(eq(orders.id, orderId));
  }

  async getFulfillmentStatus(orderId: string): Promise<FulfillmentStatus | null> {
    const row = await this.db.query.orders.findFirst({
      where: eq(orders.id, orderId),
      columns: { fulfillmentStatus: true },
    });
    return row ? (row.fulfillmentStatus as FulfillmentStatus) : null;
  }

  async setFulfillmentStatus(orderId: string, status: FulfillmentStatus): Promise<void> {
    await this.db
      .update(orders)
      .set({ fulfillmentStatus: status, updatedAt: new Date() })
      .where(eq(orders.id, orderId));
  }

  async getSummary(orderId: string): Promise<OrderSummary | null> {
    const row = await this.db.query.orders.findFirst({
      where: eq(orders.id, orderId),
      columns: { id: true, customerEmail: true, shippingAddress: true },
    });
    if (!row) return null;
    return { id: row.id, customerEmail: row.customerEmail, shippingAddress: row.shippingAddress };
  }

  async listByCustomer(userId: string): Promise<OrderListItem[]> {
    const rows = await this.db.query.orders.findMany({
      where: eq(orders.userId, userId),
      orderBy: (o, { desc }) => [desc(o.createdAt)],
    });
    return rows.map(toOrderListItem);
  }

  async listAllForAdmin(params?: { email?: string }): Promise<OrderListItem[]> {
    const rows = await this.db.query.orders.findMany({
      where: params?.email ? ilike(orders.customerEmail, `%${params.email}%`) : undefined,
      orderBy: (o, { desc }) => [desc(o.createdAt)],
    });
    return rows.map(toOrderListItem);
  }

  async findDetailById(orderId: string, userId: string): Promise<OrderDetail | null> {
    const row = await this.db.query.orders.findFirst({
      where: and(eq(orders.id, orderId), eq(orders.userId, userId)),
    });
    if (!row) return null;
    return this.hydrateOrderDetail(row);
  }

  async findById(orderId: string): Promise<OrderDetail | null> {
    const row = await this.db.query.orders.findFirst({
      where: eq(orders.id, orderId),
    });
    if (!row) return null;
    return this.hydrateOrderDetail(row);
  }

  private async hydrateOrderDetail(row: typeof orders.$inferSelect): Promise<OrderDetail> {
    const lines = await this.db.query.orderLines.findMany({
      where: eq(orderLines.orderId, row.id),
    });

    return {
      ...toOrderListItem(row),
      shippingAddress: row.shippingAddress,
      shippingAmountMinor: row.shippingAmountMinor,
      lines: lines.map((l) => ({
        sku: l.sku,
        quantity: l.quantity,
        unitAmountMinor: l.unitAmountMinor,
      })),
    };
  }
}

function toOrderListItem(row: typeof orders.$inferSelect): OrderListItem {
  return {
    id: row.id,
    customerEmail: row.customerEmail,
    createdAt: row.createdAt,
    currency: row.currency,
    amountMinor: row.amountMinor,
    paymentStatus: row.paymentStatus as PaymentStatus,
    fulfillmentStatus: row.fulfillmentStatus as FulfillmentStatus,
  };
}
