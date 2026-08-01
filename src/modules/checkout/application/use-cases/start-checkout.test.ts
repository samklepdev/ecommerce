import { describe, expect, it } from 'vitest';

import type { AssertStoreOpenForCheckout } from '@/shared/application/use-cases/assert-store-open-for-checkout';
import { StartCheckout } from './start-checkout';
import { PaymentGatewayRegistry } from '@/modules/payments/application/payment-gateway-registry';
import { Money } from '@/shared/domain/money';
import { ok, err, isErr } from '@/shared/domain/result';
import type { CheckoutOrderRepository } from '@/modules/checkout/application/ports/checkout-order-repository';
import type {
  CreatePaymentOutput,
  PaymentGateway,
} from '@/modules/payments/application/ports/payment-gateway';

function makeFakeOrders(total = Money.of(1999, 'USD'), applies = true) {
  const markedAwaiting: { orderId: string; reference: string; expiresAt: Date }[] = [];
  const repo: CheckoutOrderRepository = {
    async repriceAndGetTotal() {
      return total;
    },
    async markAwaitingPayment(orderId, reference, paymentWindowExpiresAt) {
      // `applies: false` stands for the order having moved on underneath us —
      // paid, expired or cancelled between the reprice and this write.
      if (!applies) return false;
      markedAwaiting.push({ orderId, reference, expiresAt: paymentWindowExpiresAt });
      return true;
    },
  };
  return { repo, markedAwaiting };
}

function makeFakeGateway(
  result: Awaited<ReturnType<PaymentGateway['createPayment']>>,
): PaymentGateway {
  return {
    method: 'crypto',
    async repricePayment() {
      return ok({ expiresAt: null, expectedSats: null });
    },
    async createPayment() {
      return result;
    },
  };
}

/** The kill switch, open — every test here predates it and none is about
 * it. The closed case has its own test at the bottom. */
function storeOpen(isOpen = true): AssertStoreOpenForCheckout {
  return { execute: async () => isOpen } as AssertStoreOpenForCheckout;
}

describe('StartCheckout', () => {
  /**
   * A zero total is reachable without any admin action: a fixed-amount coupon
   * at or above the subtotal is clamped to the subtotal, and shipping is zero
   * when no rate row exists. The order is then quoted at 0 satoshis — which the
   * watcher can never see, because it treats `confirmedSats > 0` as "seen". The
   * order would sit until it expired, having burned an address index against
   * the wallet's BIP32 gap limit for an invoice nobody could pay.
   *
   * Refused before the gateway is called, so no address is allocated at all.
   */
  it('refuses a zero total before allocating an address', async () => {
    const orders = makeFakeOrders(Money.zero('USD'));
    const created: string[] = [];
    const gateway: PaymentGateway = {
      method: 'crypto',
      async repricePayment() {
        return ok({ expiresAt: null, expectedSats: null });
      },
      async createPayment() {
        created.push('createPayment');
        throw new Error('gateway must not be reached');
      },
    };

    const result = await new StartCheckout(
      orders.repo,
      new PaymentGatewayRegistry([gateway]),
      900,
      24,
      storeOpen(),
    ).execute({
      orderId: 'order-1',
      customerEmail: 'a@b.com',
      paymentMethod: 'crypto',
      idempotencyKey: 'order-1',
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.code).toBe('total_not_payable');
    // The important part: no address was derived, so no index was burned.
    expect(created).toEqual([]);
    expect(orders.markedAwaiting).toEqual([]);
  });

  it('refuses a negative total', async () => {
    const orders = makeFakeOrders(Money.of(-500, 'USD'));
    const created: string[] = [];
    const gateway: PaymentGateway = {
      method: 'crypto',
      async repricePayment() {
        return ok({ expiresAt: null, expectedSats: null });
      },
      async createPayment() {
        created.push('createPayment');
        throw new Error('gateway must not be reached');
      },
    };

    const result = await new StartCheckout(
      orders.repo,
      new PaymentGatewayRegistry([gateway]),
      900,
      24,
      storeOpen(),
    ).execute({
      orderId: 'order-1',
      customerEmail: 'a@b.com',
      paymentMethod: 'crypto',
      idempotencyKey: 'order-1',
    });

    expect(isErr(result)).toBe(true);
    expect(created).toEqual([]);
  });


  it('reprices, creates a payment, and marks the order awaiting payment', async () => {
    const { repo: orders, markedAwaiting } = makeFakeOrders();
    const output: CreatePaymentOutput = {
      reference: 'bc1qtest',
      bip21Uri: 'bitcoin:bc1qtest?amount=0.00001999',
      expiresAt: null,
      expectedSats: 1999,
    };
    const gateways = new PaymentGatewayRegistry([makeFakeGateway(ok(output))]);
    const useCase = new StartCheckout(orders, gateways, 900, 24, storeOpen());

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
    const useCase = new StartCheckout(orders, gateways, 900, 24, storeOpen());

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
    const useCase = new StartCheckout(orders, gateways, 900, 24, storeOpen());

    await expect(
      useCase.execute({
        orderId: 'order-1',
        customerEmail: 'test@example.com',
        paymentMethod: 'crypto',
        idempotencyKey: 'order-1',
      }),
    ).rejects.toThrow(/No payment gateway registered/);
  });

  // The authoritative half of the kill switch. The storefront's closed page
  // is cosmetic — a server action can be POSTed at directly, and an ISR page
  // can be served from cache — so the refusal has to live here.
  it('refuses when the store kill switch is on, before allocating an address', async () => {
    const { repo: orders } = makeFakeOrders();
    let createPaymentCalls = 0;
    const gateway: PaymentGateway = {
      method: 'crypto',
      async repricePayment() {
        return ok({ expiresAt: null, expectedSats: null });
      },
      async createPayment() {
        createPaymentCalls += 1;
        throw new Error('should never be reached while the store is closed');
      },
    };
    const gateways = new PaymentGatewayRegistry([gateway]);

    const result = await new StartCheckout(orders, gateways, 900, 24, storeOpen(false)).execute({
      orderId: 'order-1',
      customerEmail: 'test@example.com',
      paymentMethod: 'crypto',
      idempotencyKey: 'order-1',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('store_closed');
    // A BTC address index only ever moves forward, so a refused checkout
    // must not have burned one.
    expect(createPaymentCalls).toBe(0);
  });
});

describe('StartCheckout when the order moves underneath it', () => {
  /**
   * `markAwaitingPayment` was the one payment-status write in the codebase
   * that ignored compare-and-set: an unguarded `UPDATE ... SET payment_status
   * = 'awaiting_payment' WHERE id = ?`, returning nothing.
   *
   * It wasn't exploitable while its only caller ran microseconds after
   * `PlaceOrder` minted the order. It becomes exploitable the moment a second
   * caller exists — a resume-payment button, an admin re-issuing an invoice —
   * because it would happily write `awaiting_payment` over `paid`. And since
   * the intent would be `confirmed`, `listWatchable` would never return it
   * again: the order would sit unwatched until it expired, with the customer's
   * money already spent.
   */
  it('reports the write not applying rather than claiming checkout started', async () => {
    const { repo, markedAwaiting } = makeFakeOrders(Money.of(1999, 'USD'), false);
    const gateway = makeFakeGateway(
      ok({
        reference: 'bc1qtest',
        bip21Uri: 'bitcoin:bc1qtest?amount=0.0001',
        expiresAt: new Date(Date.now() + 900_000),
        expectedSats: 10_000,
      } satisfies CreatePaymentOutput),
    );

    const result = await new StartCheckout(
      repo,
      new PaymentGatewayRegistry([gateway]),
      900,
      24,
      storeOpen(),
    ).execute({
      orderId: 'order-1',
      customerEmail: 'a@b.c',
      paymentMethod: 'crypto',
      idempotencyKey: 'order-1',
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.code).toBe('order_closed');
    expect(markedAwaiting).toEqual([]);
  });
});
