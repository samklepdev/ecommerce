import { describe, expect, it } from 'vitest';

import { EmailUnderpaymentNotifier } from './email-underpayment-notifier';
import type {
  OrderDetail,
  OrderHistoryRepository,
} from '@/modules/orders/application/ports/order-history-repository';
import type {
  BitcoinPaymentIntent,
  BitcoinPaymentStore,
} from '@/modules/payments/application/ports/bitcoin-ports';
import type { EmailMessage, EmailSender } from '@/modules/notifications/application/ports/email-sender';

const WINDOW_HOURS = 48;

function makeFakeOrderHistory(order: OrderDetail | null) {
  const repo: Partial<OrderHistoryRepository> = {
    async findById() {
      return order;
    },
  };
  return repo as OrderHistoryRepository;
}

function makeFakePayments(intent: BitcoinPaymentIntent | null) {
  const store: Partial<BitcoinPaymentStore> = {
    async getByOrderId() {
      return intent;
    },
  };
  return store as BitcoinPaymentStore;
}

function makeFakeEmailSender() {
  const sent: EmailMessage[] = [];
  const sender: EmailSender = {
    async send(message) {
      sent.push(message);
    },
  };
  return { sender, sent };
}

function makeOrder(overrides: Partial<OrderDetail> = {}): OrderDetail {
  return {
    id: 'order-1',
    createdAt: new Date('2026-08-01T10:00:00.000Z'),
    currency: 'USD',
    amountMinor: 10_000,
    paymentStatus: 'awaiting_confirmation',
    fulfillmentStatus: 'unfulfilled',
    customerEmail: 'buyer@example.com',
    shippingAddress: null,
    shippingAmountMinor: 0,
    paymentRecoveredFrom: null,
    notes: null,
    discountAmountMinor: 0,
    couponCode: null,
    awaitingConfirmationSince: new Date('2026-08-01T10:00:00.000Z'),
    lines: [],
    ...overrides,
  } as OrderDetail;
}

function makeIntent(overrides: Partial<BitcoinPaymentIntent> = {}): BitcoinPaymentIntent {
  return {
    orderId: 'order-1',
    address: 'bc1qtest',
    addressIndex: 0,
    expectedSats: 100_000,
    fiatCurrency: 'USD',
    satsPerFiatUnit: 1000,
    expiresAt: new Date(),
    status: 'awaiting',
    confirmedSats: 0,
    pendingSats: 0,
    ...overrides,
  };
}

function notifier(order: OrderDetail | null, intent: BitcoinPaymentIntent | null) {
  const { sender, sent } = makeFakeEmailSender();
  const subject = new EmailUnderpaymentNotifier(
    makeFakeOrderHistory(order),
    makeFakePayments(intent),
    sender,
    'https://shop.example',
    'help@shop.example',
    WINDOW_HOURS,
  );
  return { subject, sent };
}

describe('EmailUnderpaymentNotifier', () => {
  /**
   * The three figures in this email have to add up, because a customer who
   * does the subtraction themselves and sends the difference cannot get it
   * back — bitcoin is irreversible and there is no refund mechanism.
   *
   * They didn't. `outstandingSats` was made to subtract mempool value (so we
   * never ask twice for money already on its way) while `receivedBtc` stayed
   * confirmed-only. The watcher's first underpaid pass normally happens while
   * the payment is still unconfirmed, so the common case read: "We received
   * 0.00000000 BTC, the total is 0.00100000, send the remaining 0.00060000."
   */
  it('counts money in the mempool as received, so received + remaining equals the total', async () => {
    const { subject, sent } = notifier(
      makeOrder(),
      makeIntent({ expectedSats: 100_000, confirmedSats: 0, pendingSats: 40_000 }),
    );

    await subject.notifyUnderpaid('order-1');

    expect(sent).toHaveLength(1);
    const body = sent[0]!.text ?? '';
    // 0.0004 received + 0.0006 outstanding = 0.001 expected.
    expect(body).toContain('0.00040000');
    expect(body).toContain('0.00060000');
    expect(body).toContain('0.00100000');
    // The figure that made the email self-contradictory.
    expect(body).not.toContain('0.00000000');
  });

  it('adds confirmed and pending together when both are present', async () => {
    const { subject, sent } = notifier(
      makeOrder(),
      makeIntent({ expectedSats: 100_000, confirmedSats: 30_000, pendingSats: 20_000 }),
    );

    await subject.notifyUnderpaid('order-1');

    const body = sent[0]!.text ?? '';
    expect(body).toContain('0.00050000'); // received
    expect(body).toContain('0.00050000'); // outstanding — same figure here, deliberately
  });

  it('asks only for what is genuinely missing', async () => {
    const { subject, sent } = notifier(
      makeOrder(),
      makeIntent({ expectedSats: 100_000, confirmedSats: 60_000, pendingSats: 0 }),
    );

    await subject.notifyUnderpaid('order-1');

    expect(sent[0]!.text).toContain('0.00040000');
  });

  it('says nothing when the balance was cleared in the meantime', async () => {
    // Topped up between the watcher deciding to notify and this job running.
    // "You owe 0.00000000 BTC" would be worse than silence.
    const { subject, sent } = notifier(
      makeOrder(),
      makeIntent({ expectedSats: 100_000, confirmedSats: 100_000 }),
    );

    await subject.notifyUnderpaid('order-1');

    expect(sent).toEqual([]);
  });

  it('says nothing when the mempool alone covers it', async () => {
    // They have paid in full and are waiting for a block. Asking for a balance
    // here is the exact mistake that produces a double payment.
    const { subject, sent } = notifier(
      makeOrder(),
      makeIntent({ expectedSats: 100_000, confirmedSats: 0, pendingSats: 100_000 }),
    );

    await subject.notifyUnderpaid('order-1');

    expect(sent).toEqual([]);
  });

  it('states the top-up deadline', async () => {
    const { subject, sent } = notifier(
      makeOrder({ awaitingConfirmationSince: new Date('2026-08-01T10:30:00.000Z') }),
      makeIntent({ confirmedSats: 40_000 }),
    );

    await subject.notifyUnderpaid('order-1');

    // 48h on from first entry, in UTC because both surfaces render server-side.
    expect(sent[0]!.text).toContain('2026-08-03 10:30 UTC');
  });

  it('omits the deadline rather than inventing one when the clock was never stamped', async () => {
    const { subject, sent } = notifier(
      makeOrder({ awaitingConfirmationSince: null }),
      makeIntent({ confirmedSats: 40_000 }),
    );

    await subject.notifyUnderpaid('order-1');

    expect(sent[0]!.text).not.toMatch(/Please send it by/);
  });

  it('includes the address so a phone wallet has something to copy', async () => {
    const { subject, sent } = notifier(
      makeOrder(),
      makeIntent({ address: 'bc1qspecificaddress', confirmedSats: 40_000 }),
    );

    await subject.notifyUnderpaid('order-1');

    expect(sent[0]!.text).toContain('bc1qspecificaddress');
  });

  it('ships both an HTML and a plain-text part', async () => {
    const { subject, sent } = notifier(makeOrder(), makeIntent({ confirmedSats: 40_000 }));

    await subject.notifyUnderpaid('order-1');

    expect(sent[0]!.html).toBeTruthy();
    expect(sent[0]!.text).toBeTruthy();
  });

  it('says nothing when the order or the intent has gone', async () => {
    const missingOrder = notifier(null, makeIntent({ confirmedSats: 40_000 }));
    await missingOrder.subject.notifyUnderpaid('order-1');
    expect(missingOrder.sent).toEqual([]);

    const missingIntent = notifier(makeOrder(), null);
    await missingIntent.subject.notifyUnderpaid('order-1');
    expect(missingIntent.sent).toEqual([]);
  });
});
