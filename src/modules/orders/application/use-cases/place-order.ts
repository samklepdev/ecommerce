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
import type { SupplierOfferRepository } from '@/modules/sourcing/application/ports/supplier-offer-repository';

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
    /**
     * Consulted for the same reason the storefront consults it: an item whose
     * supplier can't supply it must not be sellable. The storefront was the only
     * thing checking, which made it a display rule rather than a real one — the
     * same authority-vs-display split that let a stale price reach checkout.
     */
    private readonly supplierOffers: SupplierOfferRepository,
    /**
     * How long the customer has to pay, in hours. The same value
     * `StartCheckout` uses — it stamps the deadline too, with a COALESCE, so
     * whichever runs first wins and a re-quote never extends the window.
     */
    private readonly orderWindowHours: number = 24,
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

      /**
       * And it must actually be obtainable. `PublishProducts` refuses to publish
       * a product with no offer, but an offer can be withdrawn or marked
       * unavailable afterwards — and a cart already holding the item, or a
       * direct POST to the action, bypassed the storefront's own check entirely.
       *
       * Refused here rather than flagged later: past this point the customer
       * pays irreversible bitcoin, and discovering it can't be sourced after the
       * money has settled leaves them out of pocket with no refund path.
       */
      const offer = await this.supplierOffers.findSourceableByProductId(line.productId);
      if (!offer || !offer.isAvailable) {
        return err({ code: 'product_unavailable', productId: line.productId });
      }

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

    /**
     * The clock starts here, not at `StartCheckout`.
     *
     * That call is a separate one, and when it failed the order was written
     * with a NULL deadline. `findExpiredAwaitingOrderIds` compares with `<`
     * and `listWatchable` with `>`, and NULL satisfies neither — so the order
     * could never expire *and* its address was never polled. It sat `pending`
     * forever with no exit but an admin marking it failed.
     */
    await this.orders.create(order, new Date(Date.now() + this.orderWindowHours * 3_600_000));
    return ok(order);
  }
}
