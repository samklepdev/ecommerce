import { describe, expect, it } from 'vitest';

import { UpdateOrderContact } from './update-order-contact';
import { isErr, isOk } from '@/shared/domain/result';
import type {
  EditableOrder,
  OrderContactChange,
  OrderEditRepository,
} from '@/modules/orders/application/ports/order-edit-repository';

const VALID_ADDRESS = {
  name: 'Jamie Rivera',
  line1: '14 Bridge Street',
  city: 'Austin',
  region: 'TX',
  postalCode: '78701',
  country: 'US',
};

function makeOrder(overrides: Partial<EditableOrder> = {}): EditableOrder {
  return {
    id: 'order-1',
    currency: 'USD',
    paymentStatus: 'paid',
    fulfillmentStatus: 'unfulfilled',
    shippingAmountMinor: 0,
    discountAmountMinor: 0,
    lines: [],
    ...overrides,
  };
}

function makeFakeOrders(order: EditableOrder | null) {
  const changes: OrderContactChange[] = [];
  const repo: OrderEditRepository = {
    async getEditable() {
      return order;
    },
    async updateContact(_orderId, change) {
      changes.push(change);
    },
    async replaceLines() {},
    async setPaymentWindow() {},
  };
  return { repo, changes };
}

describe('UpdateOrderContact', () => {
  it('corrects the email on a paid, unshipped order', async () => {
    const { repo, changes } = makeFakeOrders(makeOrder());

    const result = await new UpdateOrderContact(repo).execute({
      orderId: 'order-1',
      customerEmail: 'right@example.com',
    });

    expect(isOk(result)).toBe(true);
    expect(changes).toEqual([{ customerEmail: 'right@example.com', shippingAddress: undefined }]);
  });

  it('corrects the shipping address through the same value object checkout uses', async () => {
    const { repo, changes } = makeFakeOrders(makeOrder());

    const result = await new UpdateOrderContact(repo).execute({
      orderId: 'order-1',
      shippingAddress: VALID_ADDRESS,
    });

    expect(isOk(result)).toBe(true);
    expect(changes[0]?.shippingAddress).toMatchObject({ city: 'Austin', postalCode: '78701' });
  });

  // An admin must not be able to write an order an address that checkout
  // itself would have refused.
  it('rejects an address the value object refuses', async () => {
    const { repo, changes } = makeFakeOrders(makeOrder());

    const result = await new UpdateOrderContact(repo).execute({
      orderId: 'order-1',
      shippingAddress: { ...VALID_ADDRESS, line1: '' },
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.code).toBe('invalid_address');
    expect(changes).toHaveLength(0);
  });

  // The schema above this one trims, but a caller that skips it must still
  // get a `Result` back — the value object throws, and an escaped throw here
  // is a 500 on the form an admin uses to correct a wrong address.
  it.each(['name', 'line1', 'city', 'postalCode', 'country'] as const)(
    'reports a whitespace-only %s as invalid_address rather than throwing',
    async (field) => {
      const { repo, changes } = makeFakeOrders(makeOrder());

      const result = await new UpdateOrderContact(repo).execute({
        orderId: 'order-1',
        shippingAddress: { ...VALID_ADDRESS, [field]: '   ' },
      });

      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error.code).toBe('invalid_address');
      expect(changes).toHaveLength(0);
    },
  );

  it('writes the address trimmed', async () => {
    const { repo, changes } = makeFakeOrders(makeOrder());

    const result = await new UpdateOrderContact(repo).execute({
      orderId: 'order-1',
      shippingAddress: { ...VALID_ADDRESS, name: '  Jamie Rivera  ', city: ' Austin ' },
    });

    expect(isOk(result)).toBe(true);
    expect(changes[0]?.shippingAddress).toMatchObject({ name: 'Jamie Rivera', city: 'Austin' });
  });

  it('stops once the parcel is moving', async () => {
    const { repo, changes } = makeFakeOrders(makeOrder({ fulfillmentStatus: 'shipped' }));

    const result = await new UpdateOrderContact(repo).execute({
      orderId: 'order-1',
      customerEmail: 'late@example.com',
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.code).toBe('contact_locked');
    expect(changes).toHaveLength(0);
  });

  it('refuses an empty submission rather than writing nothing', async () => {
    const { repo, changes } = makeFakeOrders(makeOrder());

    const result = await new UpdateOrderContact(repo).execute({ orderId: 'order-1' });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.code).toBe('nothing_to_change');
    expect(changes).toHaveLength(0);
  });
});
