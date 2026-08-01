import { describe, expect, it } from 'vitest';

import { RefreshPaymentQuote, type QuotableOrderRepository } from './refresh-payment-quote';
import { Money } from '@/shared/domain/money';
import { ok, err, isErr, isOk } from '@/shared/domain/result';
import type { PaymentGateway } from '@/modules/payments/application/ports/payment-gateway';

const NOW = new Date('2026-07-29T12:00:00.000Z');
const NEW_EXPIRY = new Date('2026-07-29T12:15:00.000Z');

function makeFakeOrders(order: {
  paymentStatus: string;
  paymentDeadlineAt: Date | null;
  total?: Money;
} | null) {
  const windows: Date[] = [];
  const repo: QuotableOrderRepository = {
    async findQuotable() {
      return order ? { ...order, total: order.total ?? Money.of(12_000, 'USD') } : null;
    },
    async setPaymentWindow(_orderId, expiresAt) {
      windows.push(expiresAt);
    },
  };
  return { repo, windows };
}

function makeFakeGateway(outcome: 'ok' | 'fail' | 'no_intent' | 'in_flight' = 'ok') {
  const calls: number[] = [];
  const gateway: PaymentGateway = {
    method: 'crypto',
    async createPayment() {
      throw new Error('not used');
    },
    async repricePayment(input) {
      calls.push(input.amount.amountMinor);
      if (outcome === 'fail') return err({ code: 'payment_not_repriceable' });
      if (outcome === 'in_flight') return err({ code: 'payment_in_flight' });
      if (outcome === 'no_intent') return ok({ expiresAt: null, expectedSats: null });
      return ok({ expiresAt: NEW_EXPIRY, expectedSats: 120_000 });
    },
  };
  return { gateway, calls };
}

describe('RefreshPaymentQuote', () => {
  it('re-quotes an order whose rate lock lapsed but whose window is still open', async () => {
    const { repo, windows } = makeFakeOrders({
      paymentStatus: 'awaiting_payment',
      paymentDeadlineAt: new Date(NOW.getTime() + 6 * 3_600_000),
    });
    const { gateway, calls } = makeFakeGateway();

    const result = await new RefreshPaymentQuote(repo, gateway, () => NOW).execute({
      orderId: 'order-1',
    });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toEqual({ expectedSats: 120_000, expiresAt: NEW_EXPIRY });
    expect(calls).toEqual([12_000]);
    // The order's own copy of the window has to move with the intent's, or
    // the countdown disagrees with the amount shown beside it.
    expect(windows).toEqual([NEW_EXPIRY]);
  });

  // The 24-hour promise has to actually end somewhere.
  it('refuses once the order window has closed', async () => {
    const { repo, windows } = makeFakeOrders({
      paymentStatus: 'awaiting_payment',
      paymentDeadlineAt: new Date(NOW.getTime() - 1000),
    });
    const { gateway, calls } = makeFakeGateway();

    const result = await new RefreshPaymentQuote(repo, gateway, () => NOW).execute({
      orderId: 'order-1',
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.code).toBe('window_closed');
    expect(calls).toEqual([]);
    expect(windows).toEqual([]);
  });

  // Past awaiting_payment the chain has seen money; re-quoting would move
  // the goalposts under a payment already in flight.
  it.each(['awaiting_confirmation', 'paid', 'expired', 'cancelled', 'failed'])(
    'refuses to re-quote a %s order',
    async (paymentStatus) => {
      const { repo } = makeFakeOrders({
        paymentStatus,
        paymentDeadlineAt: new Date(NOW.getTime() + 3_600_000),
      });
      const { gateway, calls } = makeFakeGateway();

      const result = await new RefreshPaymentQuote(repo, gateway, () => NOW).execute({
        orderId: 'order-1',
      });

      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error.code).toBe('not_awaiting_payment');
      expect(calls).toEqual([]);
    },
  );

  it('reports a gateway that refused the re-quote', async () => {
    const { repo, windows } = makeFakeOrders({
      paymentStatus: 'awaiting_payment',
      paymentDeadlineAt: new Date(NOW.getTime() + 3_600_000),
    });
    const { gateway } = makeFakeGateway('fail');

    const result = await new RefreshPaymentQuote(repo, gateway, () => NOW).execute({
      orderId: 'order-1',
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.code).toBe('quote_failed');
    expect(windows).toEqual([]);
  });

  it('reports an order that never had a payment intent', async () => {
    const { repo } = makeFakeOrders({
      paymentStatus: 'pending',
      paymentDeadlineAt: new Date(NOW.getTime() + 3_600_000),
    });
    const { gateway } = makeFakeGateway('no_intent');

    const result = await new RefreshPaymentQuote(repo, gateway, () => NOW).execute({
      orderId: 'order-1',
    });

    expect(isErr(result)).toBe(true);
  });

  it('reports a missing order', async () => {
    const { repo } = makeFakeOrders(null);
    const { gateway } = makeFakeGateway();

    const result = await new RefreshPaymentQuote(repo, gateway, () => NOW).execute({
      orderId: 'gone',
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.code).toBe('order_not_found');
  });
});

describe('RefreshPaymentQuote and a payment already on its way', () => {
  it('surfaces the gateway refusing to reprice a funded address, distinctly', async () => {
    // The status guard above can't catch this on its own: an order only leaves
    // `awaiting_payment` once the watcher sees value, so a customer who
    // broadcast seconds ago still reads as safe to re-quote. The gateway checks
    // the address itself, and this code has to survive the trip out — mapped to
    // `quote_failed` it would render as "couldn't refresh the price", which
    // reads as a failure and invites them to send again.
    const { repo, windows } = makeFakeOrders({
      paymentStatus: 'awaiting_payment',
      paymentDeadlineAt: new Date(NOW.getTime() + 6 * 3_600_000),
    });
    const { gateway } = makeFakeGateway('in_flight');

    const result = await new RefreshPaymentQuote(repo, gateway, () => NOW).execute({
      orderId: 'order-1',
    });

    expect(isOk(result)).toBe(false);
    if (!isOk(result)) expect(result.error.code).toBe('payment_in_flight');
    // And the order's window was not moved on the back of a refusal.
    expect(windows).toEqual([]);
  });
});
