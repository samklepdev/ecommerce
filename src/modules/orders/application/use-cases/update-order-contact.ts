import type { UseCase } from '@/shared/application/use-case';
import { err, ok, type Result } from '@/shared/domain/result';
import { isOrderContactEditable } from '@/modules/orders/domain/order-status';
import { ShippingAddress, type ShippingAddressProps } from '@/modules/orders/domain/shipping-address';
import type { OrderEditRepository } from '@/modules/orders/application/ports/order-edit-repository';

export interface UpdateOrderContactInput {
  orderId: string;
  customerEmail?: string;
  shippingAddress?: ShippingAddressProps;
}

export type UpdateOrderContactError =
  | { code: 'order_not_found' }
  | { code: 'contact_locked'; fulfillmentStatus: string }
  | { code: 'nothing_to_change' }
  | { code: 'invalid_address'; message: string };

/**
 * Corrects who an order is for and where it goes.
 *
 * Separate from `EditOrderLines` because the constraint is different: this
 * never changes what is owed, so it stays available on a paid order right up
 * until the parcel moves. A typo'd email means the customer never gets their
 * confirmation, and a wrong address means the parcel goes to the wrong
 * house — both are worth fixing late.
 *
 * The address goes through the same `ShippingAddress` value object the
 * checkout uses, so an admin can't write an order an address that checkout
 * would have rejected.
 */
export class UpdateOrderContact
  implements UseCase<UpdateOrderContactInput, Result<void, UpdateOrderContactError>>
{
  constructor(private readonly orders: OrderEditRepository) {}

  async execute(input: UpdateOrderContactInput): Promise<Result<void, UpdateOrderContactError>> {
    if (!input.customerEmail && !input.shippingAddress) {
      return err({ code: 'nothing_to_change' });
    }

    const order = await this.orders.getEditable(input.orderId);
    if (!order) return err({ code: 'order_not_found' });

    if (!isOrderContactEditable(order.paymentStatus, order.fulfillmentStatus)) {
      return err({ code: 'contact_locked', fulfillmentStatus: order.fulfillmentStatus });
    }

    let shippingAddress;
    if (input.shippingAddress) {
      try {
        shippingAddress = ShippingAddress.create(input.shippingAddress).toJSON();
      } catch (e) {
        return err({
          code: 'invalid_address',
          message: e instanceof Error ? e.message : 'Invalid address',
        });
      }
    }

    await this.orders.updateContact(input.orderId, {
      customerEmail: input.customerEmail,
      shippingAddress,
    });
    return ok(undefined);
  }
}
