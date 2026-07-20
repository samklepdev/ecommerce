import { describe, expect, it } from 'vitest';

import { StartCheckout } from './start-checkout';
import { PaymentGatewayRegistry } from '@/modules/payments/application/payment-gateway-registry';
import { Money } from '@/shared/domain/money';
import { ok, err } from '@/shared/domain/result';
import type { CheckoutOrderRepository } from '@/modules/checkout/application/ports/checkout-order-repository';
import type {
  CreatePaymentOutput,
  PaymentGateway,
} from '@/modules/payments/application/ports/payment-gateway';

function makeFakeOrders(total = Money.of(1999, 'USD')) {
  const markedAwaiting: { orderId: string; reference: string; expiresAt: Date }[] = [];
  const repo: CheckoutOrderRepository = {
    async repriceAndGetTotal() {
      return total;
    },
    async markAwaitingPayment(orderId, reference, paymentWindowExpiresAt) {
      markedAwaiting.push({ orderId, reference, expiresAt: paymentWindowExpiresAt });
    },
  };
  return { repo, markedAwaiting };
}

function makeFakeGateway(
  result: Awaited<ReturnType<PaymentGateway['createPayment']>>,
): PaymentGateway {
  return {
    method: 'crypto',
    async createPayment() {
      return result;
    },
  };
}

describe('StartCheckout', () => {
  it('reprices, creates a payment, and marks the order awaiting payment', async () => {
    const { repo: orders, markedAwaiting } = makeFakeOrders();
    const output: CreatePaymentOutput = {
      reference: 'bc1qtest',
      bip21Uri: 'bitcoin:bc1qtest?amount=0.00001999',
      expiresAt: null,
    };
    const gateways = new PaymentGatewayRegistry([makeFakeGateway(ok(output))]);
    const useCase = new StartCheckout(orders, gateways, 900);

    const result = await useCase.execute({
      orderId: 'order-1',
      customerEmail: 'test@example.com',
      paymentMethod: 'crypto',
      idempotencyKey: 'order-1',
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.reference).toBe('bc1qtest');
    expect(markedAwaiting).toHaveLength(1);
    expect(markedAwaiting[0]?.orderId).toBe('order-1');
    expect(markedAwaiting[0]?.reference).toBe('bc1qtest');

    // Expiry is computed from the injected TTL (900s), not a hardcoded value.
    const expiresInMs = markedAwaiting[0]!.expiresAt.getTime() - Date.now();
    expect(expiresInMs).toBeGreaterThan(895_000);
    expect(expiresInMs).toBeLessThanOrEqual(900_000);
  });

  it('propagates a gateway error without marking the order awaiting payment', async () => {
    const { repo: orders, markedAwaiting } = makeFakeOrders();
    const gateways = new PaymentGatewayRegistry([
      makeFakeGateway(err({ code: 'gateway_error', message: 'boom' })),
    ]);
    const useCase = new StartCheckout(orders, gateways, 900);

    const result = await useCase.execute({
      orderId: 'order-1',
      customerEmail: 'test@example.com',
      paymentMethod: 'crypto',
      idempotencyKey: 'order-1',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('gateway_error');
    expect(markedAwaiting).toHaveLength(0);
  });

  it('throws when no gateway is registered for the requested payment method', async () => {
    const { repo: orders } = makeFakeOrders();
    const gateways = new PaymentGatewayRegistry([]);
    const useCase = new StartCheckout(orders, gateways, 900);

    await expect(
      useCase.execute({
        orderId: 'order-1',
        customerEmail: 'test@example.com',
        paymentMethod: 'crypto',
        idempotencyKey: 'order-1',
      }),
    ).rejects.toThrow(/No payment gateway registered/);
  });
});
