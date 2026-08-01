import { describe, expect, it } from 'vitest';

import { FailOrder } from './fail-order';
import type { ConfirmPaymentOrderRepository } from '@/modules/orders/application/ports/order-repository';
import type { PaymentStatus } from '@/modules/orders/domain/order-status';

/**
 * @param concurrentWrite a status some other actor commits *between* this use
 *   case reading and writing — how a TOCTOU race is reproduced deterministically.
 */
function makeFakeOrders(initialStatus: PaymentStatus | null, concurrentWrite?: PaymentStatus) {
  let status = initialStatus;
  let raced = false;
  const repo: ConfirmPaymentOrderRepository = {
    async getPaymentStatus() {
      const seen = status;
      if (concurrentWrite && !raced) {
        raced = true;
        status = concurrentWrite;
      }
      return seen;
    },
    async setPaymentStatus(_orderId, next, expectedFrom) {
      // Compare-and-set, mirroring the guarded SQL UPDATE.
      if (status !== expectedFrom) return false;
      status = next;
      return true;
    },
    async recordPaymentRecovery() {},
  };
  return { repo, getStatus: () => status };
}

describe('FailOrder', () => {
  /**
   * The race that motivated the compare-and-set. An admin opens an underpaid
   * order and clicks Fail; while the action is in flight the customer's top-up
   * confirms and the watcher writes `paid`. With an unguarded UPDATE the admin's
   * write lands second and `failed` overwrites `paid` — and `failed` is
   * terminal, `paid` is unreachable from it, and there is no refund mechanism.
   * The customer has paid in full for a dead order.
   */
  it('refuses to overwrite a payment that confirmed mid-action', async () => {
    const { repo, getStatus } = makeFakeOrders('awaiting_confirmation', 'paid');

    const result = await new FailOrder(repo).execute({ orderId: 'order-1' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('changed_underneath');
    // The money is what matters: the order is still paid.
    expect(getStatus()).toBe('paid');
  });

  it('refuses when the order was cancelled mid-action', async () => {
    const { repo, getStatus } = makeFakeOrders('awaiting_payment', 'cancelled');

    const result = await new FailOrder(repo).execute({ orderId: 'order-1' });

    expect(result.ok).toBe(false);
    expect(getStatus()).toBe('cancelled');
  });

  it('transitions an awaiting_confirmation order to failed', async () => {
    const { repo, getStatus } = makeFakeOrders('awaiting_confirmation');

    const result = await new FailOrder(repo).execute({ orderId: 'order-1' });

    expect(result.ok).toBe(true);
    expect(getStatus()).toBe('failed');
  });

  it('returns not_found for a nonexistent order', async () => {
    const { repo } = makeFakeOrders(null);

    const result = await new FailOrder(repo).execute({ orderId: 'missing' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('not_found');
  });

  it('returns illegal_transition for an order that is already paid', async () => {
    const { repo, getStatus } = makeFakeOrders('paid');

    const result = await new FailOrder(repo).execute({ orderId: 'order-1' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('illegal_transition');
    expect(getStatus()).toBe('paid'); // unchanged
  });

  it('returns illegal_transition for an order that is already failed (no double-fail)', async () => {
    const { repo, getStatus } = makeFakeOrders('failed');

    const result = await new FailOrder(repo).execute({ orderId: 'order-1' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('illegal_transition');
    expect(getStatus()).toBe('failed');
  });
});
