import { randomUUID } from 'node:crypto';
import { and, eq, gte, ilike, inArray, isNotNull, lt, lte, sql } from 'drizzle-orm';

import type { DB } from '@/shared/infrastructure/db/client';
import { orderLines, orderEvents, orders, products } from '@/shared/infrastructure/db/schema';
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
import type { MarkAwaitingConfirmationOrderRepository } from '@/modules/orders/application/use-cases/mark-awaiting-confirmation';
import type { UpdateOrderNotesRepository } from '@/modules/orders/application/use-cases/update-order-notes';
import type {
  ListOrderEventsRepository,
  OrderEventRecord,
} from '@/modules/orders/application/use-cases/list-order-events';
import type {
  DailyRevenue,
  RevenueSummaryRepository,
} from '@/modules/orders/application/use-cases/get-revenue-summary';
import type { StuckAwaitingConfirmationOrderRepository } from '@/modules/orders/application/use-cases/fail-stuck-awaiting-confirmation-orders';
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
    MarkAwaitingConfirmationOrderRepository,
    UpdateOrderNotesRepository,
    ListOrderEventsRepository,
    StuckAwaitingConfirmationOrderRepository,
    OrderFulfillmentRepository,
    PaidOrderLinesRepository,
    OrderSummaryRepository,
    OrderHistoryRepository,
    UnfulfillableOrderLinesRepository,
    CancelOrderRepository,
    RevenueSummaryRepository
{
  constructor(private readonly db: DB) {}

  /** Inserts one `order_events` row — shared by every method below that
   * mutates an order's status, so the status write and its event row
   * always commit together inside the same transaction. */
  private async recordOrderEvent(
    tx: Pick<DB, 'insert'>,
    orderId: string,
    eventType: string,
    status: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await tx.insert(orderEvents).values({
      id: randomUUID(),
      orderId,
      eventType,
      status,
      metadata: metadata ?? null,
    });
  }

  async listForOrder(orderId: string): Promise<OrderEventRecord[]> {
    const rows = await this.db.query.orderEvents.findMany({
      where: eq(orderEvents.orderId, orderId),
      orderBy: (e, { asc }) => [asc(e.createdAt)],
    });
    return rows.map((r) => ({
      id: r.id,
      eventType: r.eventType,
      status: r.status,
      metadata: (r.metadata as Record<string, unknown> | null) ?? null,
      createdAt: r.createdAt,
    }));
  }

  async getDailyRevenue(since: Date, until: Date): Promise<{ currency: string | null; days: DailyRevenue[] }> {
    const rows = await this.db
      .select({
        day: sql<string>`to_char(${orderEvents.createdAt}, 'YYYY-MM-DD')`,
        totalMinor: sql<number>`sum((${orderEvents.metadata}->>'amountMinor')::bigint)`,
        totalQuantity: sql<number>`sum(coalesce((${orderEvents.metadata}->>'quantity')::bigint, 0))`,
        orderCount: sql<number>`count(*)`,
        currency: orders.currency,
      })
      .from(orderEvents)
      .innerJoin(orders, eq(orders.id, orderEvents.orderId))
      .where(
        and(
          eq(orderEvents.eventType, 'order_created'),
          gte(orderEvents.createdAt, since),
          lte(orderEvents.createdAt, until),
        ),
      )
      .groupBy(sql`1`, orders.currency)
      .orderBy(sql`1`);

    const days: DailyRevenue[] = rows.map((r) => ({
      day: r.day,
      totalMinor: Number(r.totalMinor),
      orderCount: Number(r.orderCount),
      totalQuantity: Number(r.totalQuantity),
    }));
    return { currency: rows[0]?.currency ?? null, days };
  }

  /** Real production path: persist an order + its lines from a priced cart. */
  async create(order: Order): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.insert(orders).values({
        id: order.id,
        userId: order.userId,
        currency: order.currency,
        amountMinor: order.total.amountMinor,
        shippingAmountMinor: order.shippingAmount.amountMinor,
        discountAmountMinor: order.discountAmount.amountMinor,
        couponCode: order.couponCode,
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
            productId: line.productId,
            sku: line.sku,
            quantity: line.quantity,
            unitAmountMinor: line.unitPrice.amountMinor,
          })),
        );
      }
      await this.recordOrderEvent(tx, order.id, 'order_created', order.paymentStatus, {
        amountMinor: order.total.amountMinor,
        lineCount: order.lines.length,
        quantity: order.lines.reduce((sum, line) => sum + line.quantity, 0),
      });
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
    const linesTotal = lines.reduce(
      (total, l) => total.add(Money.of(l.unitAmountMinor, row.currency).multiply(l.quantity)),
      Money.zero(row.currency),
    );
    const withShipping = linesTotal.add(Money.of(row.shippingAmountMinor, row.currency));
    // Subtract last, from a total that already includes shipping — never
    // construct a negative intermediate Money value.
    return row.discountAmountMinor > 0
      ? withShipping.subtract(Money.of(row.discountAmountMinor, row.currency))
      : withShipping;
  }

  async getOrderLines(orderId: string): Promise<PaidOrderLine[]> {
    const rows = await this.db.query.orderLines.findMany({
      where: eq(orderLines.orderId, orderId),
    });
    return rows.map((r) => ({ id: r.id, productId: r.productId, quantity: r.quantity }));
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
      productId: r.productId,
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
    return this.db.transaction(async (tx) => {
      const result = await tx
        .update(orders)
        .set({ paymentStatus: 'expired', updatedAt: new Date() })
        .where(
          and(eq(orders.id, orderId), inArray(orders.paymentStatus, ['pending', 'awaiting_payment'])),
        )
        .returning({ id: orders.id });
      if (result.length > 0) {
        await this.recordOrderEvent(tx, orderId, 'payment_status_changed', 'expired');
      }
      return result.length > 0;
    });
  }

  /** Guarded so `awaitingConfirmationSince` is only ever stamped on the
   * actual awaiting_payment -> awaiting_confirmation transition — a repeat
   * call while already awaiting_confirmation matches zero rows and is a
   * no-op, so the timestamp keeps reflecting first entry. */
  async markAwaitingConfirmation(orderId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const result = await tx
        .update(orders)
        .set({ paymentStatus: 'awaiting_confirmation', awaitingConfirmationSince: new Date(), updatedAt: new Date() })
        .where(and(eq(orders.id, orderId), eq(orders.paymentStatus, 'awaiting_payment')))
        .returning({ id: orders.id });
      if (result.length > 0) {
        await this.recordOrderEvent(tx, orderId, 'payment_status_changed', 'awaiting_confirmation');
      }
    });
  }

  async findStuckAwaitingConfirmationOrderIds(cutoff: Date): Promise<string[]> {
    const rows = await this.db.query.orders.findMany({
      where: and(
        eq(orders.paymentStatus, 'awaiting_confirmation'),
        lt(orders.awaitingConfirmationSince, cutoff),
      ),
      columns: { id: true },
    });
    return rows.map((r) => r.id);
  }

  /** Guarded, idempotent: returns false if another pass already resolved this order. */
  async tryFailStuckAwaitingConfirmation(orderId: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const result = await tx
        .update(orders)
        .set({ paymentStatus: 'failed', updatedAt: new Date() })
        .where(and(eq(orders.id, orderId), eq(orders.paymentStatus, 'awaiting_confirmation')))
        .returning({ id: orders.id });
      if (result.length > 0) {
        await this.recordOrderEvent(tx, orderId, 'payment_status_changed', 'failed');
      }
      return result.length > 0;
    });
  }

  /** Guarded, idempotent, same shape as `tryExpire` — `ownerUserId: null`
   * skips the ownership filter entirely (the guest order page's existing
   * trust model: order id alone is the access capability). */
  async cancelOrder(orderId: string, ownerUserId: string | null): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const result = await tx
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
      if (result.length > 0) {
        await this.recordOrderEvent(tx, orderId, 'payment_status_changed', 'cancelled');
      }
      return result.length > 0;
    });
  }

  async markAwaitingPayment(
    orderId: string,
    reference: string,
    paymentWindowExpiresAt: Date,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(orders)
        .set({
          paymentStatus: 'awaiting_payment',
          paymentReference: reference,
          paymentWindowExpiresAt,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, orderId));
      await this.recordOrderEvent(tx, orderId, 'payment_status_changed', 'awaiting_payment');
    });
  }

  async getPaymentStatus(orderId: string): Promise<PaymentStatus | null> {
    const row = await this.db.query.orders.findFirst({
      where: eq(orders.id, orderId),
      columns: { paymentStatus: true },
    });
    return row ? (row.paymentStatus as PaymentStatus) : null;
  }

  async setPaymentStatus(orderId: string, status: PaymentStatus): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(orders)
        .set({ paymentStatus: status, updatedAt: new Date() })
        .where(eq(orders.id, orderId));
      await this.recordOrderEvent(tx, orderId, 'payment_status_changed', status);
    });
  }

  async recordPaymentRecovery(orderId: string, from: 'expired' | 'cancelled'): Promise<void> {
    await this.db
      .update(orders)
      .set({ paymentRecoveredFrom: from, updatedAt: new Date() })
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
    await this.db.transaction(async (tx) => {
      await tx
        .update(orders)
        .set({ fulfillmentStatus: status, updatedAt: new Date() })
        .where(eq(orders.id, orderId));
      await this.recordOrderEvent(tx, orderId, 'fulfillment_status_changed', status);
    });
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

  async setNotes(orderId: string, notes: string | null): Promise<void> {
    await this.db.update(orders).set({ notes }).where(eq(orders.id, orderId));
  }

  async findOrderIdsByEmail(email: string): Promise<string[]> {
    const rows = await this.db.query.orders.findMany({
      where: ilike(orders.customerEmail, email),
      columns: { id: true },
    });
    return rows.map((r) => r.id);
  }

  private async hydrateOrderDetail(row: typeof orders.$inferSelect): Promise<OrderDetail> {
    const lines = await this.db.query.orderLines.findMany({
      where: eq(orderLines.orderId, row.id),
    });

    const productIds = lines.map((l) => l.productId);
    const imageRows =
      productIds.length > 0
        ? await this.db
            .select({ productId: products.id, imageUrl: products.imageUrl })
            .from(products)
            .where(inArray(products.id, productIds))
        : [];
    const imageUrlByProductId = new Map(imageRows.map((r) => [r.productId, r.imageUrl]));

    return {
      ...toOrderListItem(row),
      shippingAddress: row.shippingAddress,
      shippingAmountMinor: row.shippingAmountMinor,
      notes: row.notes,
      discountAmountMinor: row.discountAmountMinor,
      couponCode: row.couponCode,
      lines: lines.map((l) => ({
        productId: l.productId,
        sku: l.sku,
        quantity: l.quantity,
        unitAmountMinor: l.unitAmountMinor,
        imageUrl: imageUrlByProductId.get(l.productId) ?? null,
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
    paymentRecoveredFrom: row.paymentRecoveredFrom as 'expired' | 'cancelled' | null,
  };
}
