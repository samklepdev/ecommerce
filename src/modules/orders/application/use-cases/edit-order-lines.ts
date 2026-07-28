import type { UseCase } from '@/shared/application/use-case';
import { err, ok, isErr, type Result } from '@/shared/domain/result';
import { Money } from '@/shared/domain/money';
import { logger } from '@/shared/infrastructure/logger';
import { areOrderLinesEditable } from '@/modules/orders/domain/order-status';
import type {
  EditableOrder,
  EditableOrderLine,
  OrderEditRepository,
} from '@/modules/orders/application/ports/order-edit-repository';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';
import type { PaymentGateway } from '@/modules/payments/application/ports/payment-gateway';

export type EditOrderLinesInput =
  | { orderId: string; op: 'set_quantity'; orderLineId: string; quantity: number }
  | { orderId: string; op: 'add_product'; productId: string; quantity: number };

export interface EditOrderLinesResult {
  /** The order's new total, so the caller can report it back. */
  totalMinor: number;
  currency: string;
  /** Set when an existing payment was re-quoted against the new total. */
  repricedSats: number | null;
}

export type EditOrderLinesError =
  | { code: 'order_not_found' }
  | { code: 'lines_locked'; paymentStatus: string }
  | { code: 'line_not_found' }
  | { code: 'product_unavailable' }
  | { code: 'last_line' }
  | { code: 'reprice_failed' };

/**
 * Changes what an unpaid order is for, and restates the payment to match.
 *
 * Only while nothing has been seen on chain (`areOrderLinesEditable`). Past
 * that, money has arrived against a total, and editing the total doesn't
 * reconcile it — that needs a refund or a balance due, which is a decision,
 * not a form field.
 *
 * Prices always come from the catalog, never from the caller: an admin
 * choosing what a customer owes is the same trust problem as a client
 * submitting its own price, which the cart already refuses.
 *
 * The re-quote is the delicate part. The order total moves, so the BTC
 * amount owed moves with it, on the same address (see
 * `PaymentGateway.repricePayment`). The customer's checkout page polls, so
 * it picks the new amount up — but anyone looking at a printed QR is now
 * looking at a stale one, which is why this is refused the moment the chain
 * has seen anything.
 */
export class EditOrderLines
  implements UseCase<EditOrderLinesInput, Result<EditOrderLinesResult, EditOrderLinesError>>
{
  constructor(
    private readonly orders: OrderEditRepository,
    private readonly products: ProductRepository,
    private readonly payments: PaymentGateway,
  ) {}

  async execute(
    input: EditOrderLinesInput,
  ): Promise<Result<EditOrderLinesResult, EditOrderLinesError>> {
    const order = await this.orders.getEditable(input.orderId);
    if (!order) return err({ code: 'order_not_found' });
    if (!areOrderLinesEditable(order.paymentStatus)) {
      return err({ code: 'lines_locked', paymentStatus: order.paymentStatus });
    }

    const nextLines =
      input.op === 'set_quantity'
        ? this.withQuantity(order, input.orderLineId, input.quantity)
        : await this.withProduct(order, input.productId, input.quantity);
    if (isErr(nextLines)) return nextLines;

    if (nextLines.value.length === 0) return err({ code: 'last_line' });

    const total = orderTotal(order, nextLines.value);
    await this.orders.replaceLines(order.id, nextLines.value, total.amountMinor);

    const repriced = await this.payments.repricePayment({ orderId: order.id, amount: total });
    if (isErr(repriced)) {
      // The lines are already committed. Report it rather than pretending
      // the edit failed — the amount owed on the payment is now stale, and
      // that's the thing an admin has to know about.
      logger.error('order edited but payment could not be repriced', {
        orderId: order.id,
        error: repriced.error.code,
      });
      return err({ code: 'reprice_failed' });
    }

    if (repriced.value.expiresAt) {
      await this.orders.setPaymentWindow(order.id, repriced.value.expiresAt);
    }

    return ok({
      totalMinor: total.amountMinor,
      currency: total.currency,
      repricedSats: repriced.value.expectedSats,
    });
  }

  private withQuantity(
    order: EditableOrder,
    orderLineId: string,
    quantity: number,
  ): Result<EditableOrderLine[], EditOrderLinesError> {
    if (!order.lines.some((l) => l.id === orderLineId)) return err({ code: 'line_not_found' });

    // Zero removes the line — the same gesture as setting a cart line to 0,
    // rather than a separate delete path that could drift from this one.
    const next = order.lines
      .map((line) => (line.id === orderLineId ? { ...line, quantity } : line))
      .filter((line) => line.quantity > 0);
    return ok(next);
  }

  private async withProduct(
    order: EditableOrder,
    productId: string,
    quantity: number,
  ): Promise<Result<EditableOrderLine[], EditOrderLinesError>> {
    if (quantity <= 0) return err({ code: 'product_unavailable' });

    // findAnyById, not findById: this is an admin adding to an order, and a
    // product that has since been archived is still a thing they may need to
    // put on one. The price still comes from the catalog row.
    const product = await this.products.findAnyById(productId);
    if (!product) return err({ code: 'product_unavailable' });
    if (product.price.currency !== order.currency) return err({ code: 'product_unavailable' });

    const existing = order.lines.find((l) => l.productId === productId);
    if (existing) {
      // Already on the order: add to it rather than creating a second line
      // for the same product, which would render as a duplicate row.
      return ok(
        order.lines.map((line) =>
          line.productId === productId ? { ...line, quantity: line.quantity + quantity } : line,
        ),
      );
    }

    return ok([
      ...order.lines,
      {
        id: null,
        productId: product.id,
        sku: product.sku,
        quantity,
        unitAmountMinor: product.price.amountMinor,
      },
    ]);
  }
}

/** Line items + shipping − discount, the same definition `Order.total` uses.
 * Both snapshots stay as they were: an edit to the lines is not an occasion
 * to re-read the shipping rate or re-apply a coupon. */
function orderTotal(order: EditableOrder, lines: EditableOrderLine[]): Money {
  const subtotal = lines.reduce(
    (sum, line) => sum.add(Money.of(line.unitAmountMinor, order.currency).multiply(line.quantity)),
    Money.zero(order.currency),
  );
  return subtotal
    .add(Money.of(order.shippingAmountMinor, order.currency))
    .subtract(Money.of(order.discountAmountMinor, order.currency));
}
