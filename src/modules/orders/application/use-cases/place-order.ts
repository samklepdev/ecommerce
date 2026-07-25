import { randomUUID } from 'node:crypto';

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
  | { code: 'variant_unavailable'; variantId: string }
  | { code: 'invalid_coupon' };

/** Real production path: turns a priced cart into a durable, pending order. */
export class PlaceOrder implements UseCase<PlaceOrderInput, Result<Order, PlaceOrderError>> {
  constructor(
    private readonly carts: CartRepository,
    private readonly products: ProductRepository,
    private readonly orders: OrderRepository,
    private readonly shippingRates: ShippingRateRepository,
    private readonly coupons: CouponRepository,
  ) {}

  async execute(input: PlaceOrderInput): Promise<Result<Order, PlaceOrderError>> {
    const cart = await this.carts.get(input.owner);
    if (!cart || cart.isEmpty) return err({ code: 'empty_cart' });

    const lines: OrderLine[] = [];
    for (const line of cart.lines) {
      // Re-fetch from the catalog — never trust the cart's stored price.
      const variant = await this.products.findVariantById(line.variantId);
      if (!variant) return err({ code: 'variant_unavailable', variantId: line.variantId });

      lines.push(
        OrderLine.create({
          id: randomUUID(),
          variantId: variant.id,
          sku: variant.sku,
          quantity: line.quantity,
          unitPrice: variant.price,
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

    await this.orders.create(order);
    await this.carts.delete(input.owner);
    return ok(order);
  }
}
