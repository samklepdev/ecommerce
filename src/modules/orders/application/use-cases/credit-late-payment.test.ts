import { describe, expect, it } from 'vitest';

import { CreditLatePayment, type CreditablePaymentStore } from './credit-late-payment';
import { ConfirmPayment } from './confirm-payment';
import type { ConfirmPaymentOrderRepository } from '@/modules/orders/application/ports/order-repository';
import type { PaymentStatus } from '@/modules/orders/domain/order-status';
import { isErr, isOk } from '@/shared/domain/result';

function makeFakeOrders(initial: PaymentStatus | null) {
  let status = initial;
  const recovered: string[] = [];
  const repo: ConfirmPaymentOrderRepository = {
    async getPaymentStatus() {
      return status;
    },
    async setPaymentStatus(_orderId, next, expectedFrom) {
      if (status !== expectedFrom) return false;
      status = next;
      return true;
    },
    async recordPaymentRecovery(_orderId, from) {
      recovered.push(from);
    },
  };
  return { repo, recovered, getStatus: () => status };
}

function makeFakePayments(latePaymentSats: number | undefined) {
  const confirmed: string[] = [];
  const store: CreditablePaymentStore = {
    async getByOrderId(orderId) {
      return {
        orderId,
        address: 'bc1qtest',
        addressIndex: 0,
        expectedSats: 100_000,
        fiatCurrency: 'USD',
        satsPerFiatUnit: 1000,
        expiresAt: new Date(),
        status: 'expired',
        latePaymentSats,
      };
    },
    async markConfirmed(orderId) {
      confirmed.push(orderId);
    },
  };
  return { store, confirmed };
}

function makeConfirmPayment(orders: ConfirmPaymentOrderRepository) {
  const enqueued: string[] = [];
  const confirmPayment = new ConfirmPayment(
    orders,
    { seen: async () => false, markSeen: async () => {} },
    {
      async enqueueOrderPaid(orderId) {
        enqueued.push(orderId);
      },
    },
    { notifyPaymentConfirmed: async () => {} },
  );
  return { confirmPayment, enqueued };
}

describe('CreditLatePayment', () => {
  /**
   * The state machine has always had `expired -> paid` and `cancelled -> paid`,
   * with comments explaining that a payment turning up anyway must be
   * recordable rather than stranded. In practice those edges were dead code:
   * `listWatchable` stops returning an intent the moment its order closes, and
   * `ConfirmPayment`'s only caller was the watcher. So real bitcoin sitting
   * against a closed order could be *detected* (the sweep flags it, the
   * dashboard counts it) and never *credited* — recovery meant hand-written
   * SQL against production.
   */
  it('credits a payment that arrived against an expired order', async () => {
    const { repo, recovered, getStatus } = makeFakeOrders('expired');
    const { store, confirmed } = makeFakePayments(100_000);
    const { confirmPayment, enqueued } = makeConfirmPayment(repo);

    const result = await new CreditLatePayment(store, repo, confirmPayment).execute({
      orderId: 'order-1',
    });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value.creditedSats).toBe(100_000);
    expect(getStatus()).toBe('paid');
    // Recorded as a recovery, so the order is distinguishable from one that
    // simply paid on time.
    expect(recovered).toEqual(['expired']);
    // And sourcing is kicked off, exactly as a normal settlement would.
    expect(enqueued).toEqual(['order-1']);
    // The intent stops being swept, so it can't be credited twice.
    expect(confirmed).toEqual(['order-1']);
  });

  it('credits a payment that arrived against a cancelled order', async () => {
    const { repo, recovered, getStatus } = makeFakeOrders('cancelled');
    const { store } = makeFakePayments(100_000);
    const { confirmPayment } = makeConfirmPayment(repo);

    const result = await new CreditLatePayment(store, repo, confirmPayment).execute({
      orderId: 'order-1',
    });

    expect(isOk(result)).toBe(true);
    expect(getStatus()).toBe('paid');
    expect(recovered).toEqual(['cancelled']);
  });

  it('refuses when no money was ever flagged against the order', async () => {
    // The guard that stops this being "mark any order paid". An admin can
    // credit money the sweep actually saw on-chain, and nothing else.
    const { repo, getStatus } = makeFakeOrders('expired');
    const { store, confirmed } = makeFakePayments(undefined);
    const { confirmPayment, enqueued } = makeConfirmPayment(repo);

    const result = await new CreditLatePayment(store, repo, confirmPayment).execute({
      orderId: 'order-1',
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.code).toBe('no_payment_to_credit');
    expect(getStatus()).toBe('expired');
    expect(enqueued).toEqual([]);
    expect(confirmed).toEqual([]);
  });

  it('refuses when the flagged amount is zero', async () => {
    const { repo } = makeFakeOrders('expired');
    const { store } = makeFakePayments(0);
    const { confirmPayment } = makeConfirmPayment(repo);

    const result = await new CreditLatePayment(store, repo, confirmPayment).execute({
      orderId: 'order-1',
    });

    expect(isErr(result)).toBe(true);
  });

  it('refuses on an order that is still collecting, where the watcher is the right answer', async () => {
    // Not an admin's job: the watcher settles these, and crediting by hand
    // would bypass the confirmation threshold entirely.
    const { repo, getStatus } = makeFakeOrders('awaiting_confirmation');
    const { store } = makeFakePayments(100_000);
    const { confirmPayment } = makeConfirmPayment(repo);

    const result = await new CreditLatePayment(store, repo, confirmPayment).execute({
      orderId: 'order-1',
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.code).toBe('not_creditable');
    expect(getStatus()).toBe('awaiting_confirmation');
  });

  it('refuses on an order that is already paid', async () => {
    const { repo } = makeFakeOrders('paid');
    const { store } = makeFakePayments(100_000);
    const { confirmPayment } = makeConfirmPayment(repo);

    const result = await new CreditLatePayment(store, repo, confirmPayment).execute({
      orderId: 'order-1',
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.code).toBe('not_creditable');
  });

  it('reports a missing intent rather than throwing', async () => {
    const { repo } = makeFakeOrders('expired');
    const { confirmPayment } = makeConfirmPayment(repo);
    const store: CreditablePaymentStore = {
      async getByOrderId() {
        return null;
      },
      async markConfirmed() {},
    };

    const result = await new CreditLatePayment(store, repo, confirmPayment).execute({
      orderId: 'order-1',
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.code).toBe('order_not_found');
  });

  it('credits a payment that arrived against a failed order', async () => {
    // The most likely late payment of all: the customer part-paid, the 48h
    // top-up window closed, and the balance arrived afterwards against the
    // address the balance email gave them.
    const { repo, getStatus } = makeFakeOrders('failed');
    const { store, confirmed } = makeFakePayments(100_000);
    const { confirmPayment, enqueued } = makeConfirmPayment(repo);

    const result = await new CreditLatePayment(store, repo, confirmPayment).execute({
      orderId: 'order-1',
    });

    expect(isOk(result)).toBe(true);
    expect(getStatus()).toBe('paid');
    expect(enqueued).toEqual(['order-1']);
    expect(confirmed).toEqual(['order-1']);
  });
});
