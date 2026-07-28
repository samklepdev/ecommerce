import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  paymentStatusTone,
  fulfillmentStatusTone,
  supplierOrderStatusTone,
} from './status-tone';
import type { FulfillmentStatus, PaymentStatus } from '@/modules/orders/domain/order-status';
import type { SupplierOrderStatus } from '@/modules/orders/domain/supplier-order-status';

const PAYMENT_STATUSES: PaymentStatus[] = [
  'pending',
  'awaiting_payment',
  'awaiting_confirmation',
  'paid',
  'failed',
  'expired',
  'cancelled',
  'refunded',
];

const FULFILLMENT_STATUSES: FulfillmentStatus[] = [
  'unfulfilled',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
];

const SUPPLIER_ORDER_STATUSES: SupplierOrderStatus[] = [
  'needs_ordering',
  'ordered',
  'shipped',
  'cancelled',
];

describe('paymentStatusTone', () => {
  // The two the console is actually scanned for.
  it('renders paid green and awaiting_payment amber', () => {
    expect(paymentStatusTone('paid')).toBe('success');
    expect(paymentStatusTone('awaiting_payment')).toBe('warning');
  });

  // These used to collapse: failed/expired/cancelled all read as one red,
  // pending and awaiting_payment as one grey. In a column of orders that
  // made the states indistinguishable, which is the whole reason to look.
  it('gives every payment state its own tone', () => {
    const tones = PAYMENT_STATUSES.map(paymentStatusTone);
    expect(new Set(tones).size).toBe(PAYMENT_STATUSES.length);
  });
});

describe('fulfillmentStatusTone', () => {
  it('gives every fulfillment state its own tone', () => {
    const tones = FULFILLMENT_STATUSES.map(fulfillmentStatusTone);
    expect(new Set(tones).size).toBe(FULFILLMENT_STATUSES.length);
  });
});

describe('supplierOrderStatusTone', () => {
  it('gives every supplier-order state its own tone', () => {
    const tones = SUPPLIER_ORDER_STATUSES.map(supplierOrderStatusTone);
    expect(new Set(tones).size).toBe(SUPPLIER_ORDER_STATUSES.length);
  });
});

// A tone with no matching class in Badge.module.css compiles and typechecks
// perfectly — `styles[tone]` is just undefined — and renders an unstyled
// chip. Nothing else in the stack catches that.
describe('every tone these map to has a Badge class', () => {
  const css = readFileSync(
    join(process.cwd(), 'src/components/ui/Badge.module.css'),
    'utf8',
  );

  const tones = [
    ...PAYMENT_STATUSES.map(paymentStatusTone),
    ...FULFILLMENT_STATUSES.map(fulfillmentStatusTone),
    ...SUPPLIER_ORDER_STATUSES.map(supplierOrderStatusTone),
  ];

  it.each([...new Set(tones)])('%s', (tone) => {
    expect(css).toMatch(new RegExp(`^\\.${tone}\\s*\\{`, 'm'));
  });
});
