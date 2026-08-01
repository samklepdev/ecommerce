import { randomUUID } from 'node:crypto';

import type { AssertStoreOpenForCheckout } from '@/shared/application/use-cases/assert-store-open-for-checkout';

import type { UseCase } from '@/shared/application/use-case';
import { err, ok, type Result } from '@/shared/domain/result';
import { Money } from '@/shared/domain/money';
import { Order } from '@/modules/orders/domain/order';
import { OrderLine } from '@/modules/orders/domain/order-line';
import { ShippingAddress, type ShippingAddressProps } from '@/modules/orders/domain/shipping-address';
import type { CartOwner } from '@/modules/cart/domain/cart';
import type { CartRepository } from '@/modules/cart/application/ports/cart-repository';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';
import type { OrderRepository } from '@/modules/orders/application/ports/order-repository';
import type { ShippingRateRepository } from '@/modules/shipping/application/ports/shipping-rate-repository';
import type { CouponRepository } from '@/modules/coupons/application/ports/coupon-repository';

export interface PlaceOrderInput {
  owner: CartOwner;
  customerEmail: string;
  currency: string;
  shippingAddress: ShippingAddressProps;
  couponCode?: string;
}

export type PlaceOrderError =
  | { code: 'empty_cart' }
  | { code: 'product_unavailable'; productId: string }
  | { code: 'invalid_coupon' }
  | { code: 'store_closed' }
  /** Another request placed this cart first — a double-submit. */
  | { code: 'cart_already_submitted' };

/** Real production path: turns a priced cart into a durable, pending order. */
export class PlaceOrder implements UseCase<PlaceOrderInput, Result<Order, PlaceOrderError>> {
  constructor(
    private readonly carts: CartRepository,
    private readonly products: ProductRepository,
    private readonly orders: OrderRepository,
    private readonly shippingRates: ShippingRateRepository,
    private readonly coupons: CouponRepository,
    private readonly storeIsOpen: AssertStoreOpenForCheckout,
  ) {}

  async execute(input: PlaceOrderInput): Promise<Result<Order, PlaceOrderError>> {
    // First, before any repricing or coupon work: the kill switch. A closed
    // store must not mint orders, and this is checked here rather than only
    // in the UI because a server action can be POSTed at directly.
    if (!(await this.storeIsOpen.execute())) return err({ code: 'store_closed' });

    const cart = await this.carts.get(input.owner);
    if (!cart || cart.isEmpty) return err({ code: 'empty_cart' });

    const lines: OrderLine[] = [];
    for (const line of cart.lines) {
      // Re-fetch from the catalog — never trust the cart's stored price.
      const product = await this.products.findById(line.productId);
      if (!product) return err({ code: 'product_unavailable', productId: line.productId });

      lines.push(
        OrderLine.create({
          id: randomUUID(),
          productId: product.id,
          productName: product.name,
          quantity: line.quantity,
          unitPrice: product.price,
        }),
      );
    }

    // Snapshot the current global shipping rate — like line prices, never
    // re-read live after the order is placed.
    const shippingAmount = await this.shippingRates.get();

    let discountAmount = Money.zero(input.currency);
    let appliedCouponCode: string | null = null;
    if (input.couponCode) {
      const coupon = await this.coupons.findByCode(input.couponCode);
      // Same error for "doesn't exist" and "deactivated" — never leak which.
      if (!coupon || !coupon.isActive) return err({ code: 'invalid_coupon' });
      const subtotal = lines.reduce((sum, l) => sum.add(l.subtotal), Money.zero(input.currency));
      discountAmount = coupon.discountAmountFor(subtotal);
      appliedCouponCode = coupon.code;
    }

    const order = Order.create({
      id: randomUUID(),
      userId: input.owner.type === 'user' ? input.owner.userId : null,
      customerEmail: input.customerEmail,
      shippingAddress: ShippingAddress.create(input.shippingAddress),
      lines,
      currency: input.currency,
      paymentStatus: 'pending',
      fulfillmentStatus: 'unfulfilled',
      shippingAmount,
      discountAmount,
      couponCode: appliedCouponCode,
    });

    /**
     * Claim the cart **before** writing the order, and only proceed if this
     * call is the one that removed it.
     *
     * Reversed — create then delete — two concurrent submits both pass every
     * check above and both write an order. `StartCheckout` then derives an
     * address per order, so a double-click produces two invoices, burns two
     * addresses against the wallet's gap limit, and leaves whichever one the
     * customer doesn't pay outstanding.
     *
     * The cost of this ordering is that a failure in `orders.create` below
     * loses the cart without producing an order. That is a deliberate trade:
     * re-adding a cart is an annoyance, whereas two live invoices for one
     * purchase is money, and with no refund mechanism it is unrecoverable.
     */
    const claimed = await this.carts.delete(input.owner);
    if (!claimed) return err({ code: 'cart_already_submitted' });

    await this.orders.create(order);
    return ok(order);
  }
}
