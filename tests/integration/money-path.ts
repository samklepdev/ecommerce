import type Redis from 'ioredis';

// Type-only: erased at runtime, so this never pulls in the env-reading
// client module that would connect to the development database.
import type { DB } from '@/shared/infrastructure/db/client';
import { networks } from 'bitcoinjs-lib';

import type {
  AddressChainStatus,
  BtcRateProvider,
  ChainDataProvider,
} from '@/modules/payments/application/ports/bitcoin-ports';
import type { PaymentConfirmationNotifier } from '@/modules/orders/application/ports/payment-confirmation-notifier';
import { HdAddressDeriver } from '@/modules/payments/infrastructure/bitcoin/address-deriver';
import { RedisAddressIndexAllocator } from '@/modules/payments/infrastructure/bitcoin/redis-address-index-allocator';
import { DrizzleBitcoinPaymentStore } from '@/modules/payments/infrastructure/bitcoin/drizzle-bitcoin-payment-store';
import { OnChainBitcoinPaymentGateway } from '@/modules/payments/infrastructure/onchain-bitcoin-payment-gateway';
import { PaymentGatewayRegistry } from '@/modules/payments/application/payment-gateway-registry';
import { WatchBitcoinPayments } from '@/modules/payments/application/watch-bitcoin-payments';
import { RedisCartRepository } from '@/modules/cart/infrastructure/redis-cart-repository';
import { RedisProcessedEventStore } from '@/modules/orders/infrastructure/redis-processed-event-store';
import { DrizzleProductRepository } from '@/modules/catalog/infrastructure/drizzle-product-repository';
import { DrizzleOrderRepository } from '@/modules/orders/infrastructure/drizzle-order-repository';
import { DrizzleSupplierOrderRepository } from '@/modules/orders/infrastructure/drizzle-supplier-order-repository';
import { DrizzleSupplierOfferRepository } from '@/modules/sourcing/infrastructure/drizzle-supplier-offer-repository';
import { DrizzleShippingRateRepository } from '@/modules/shipping/infrastructure/drizzle-shipping-rate-repository';
import { DrizzleCouponRepository } from '@/modules/coupons/infrastructure/drizzle-coupon-repository';
import { PlaceOrder } from '@/modules/orders/application/use-cases/place-order';
import { StartCheckout } from '@/modules/checkout/application/use-cases/start-checkout';
import { ExpireStaleCheckouts } from '@/modules/checkout/application/use-cases/expire-stale-checkouts';
import { RefreshPaymentQuote } from '@/modules/checkout/application/use-cases/refresh-payment-quote';
import { ConfirmPayment } from '@/modules/orders/application/use-cases/confirm-payment';
import { MarkAwaitingConfirmation } from '@/modules/orders/application/use-cases/mark-awaiting-confirmation';
import { NotifyUnderpaidOnce } from '@/modules/orders/application/use-cases/notify-underpaid-once';
import { CreateSupplierOrdersForPaidOrder } from '@/modules/orders/application/use-cases/create-supplier-orders-for-paid-order';
import { QueuedFulfillmentQueue } from '@/modules/orders/infrastructure/queued-fulfillment-queue';
import { QueuedPaymentConfirmationNotifier } from '@/modules/orders/infrastructure/queued-payment-confirmation-notifier';
import { BullMqJobQueue } from '@/shared/infrastructure/queue/bullmq-job-queue';
import { createJobWorker } from '@/workers/job-worker';
import { TEST_REDIS_URL } from './config';
import type { AssertStoreOpenForCheckout } from '@/shared/application/use-cases/assert-store-open-for-checkout';

/** A watch-only testnet xpub. Public data by definition — this is the whole
 * point of the design: the server can derive addresses and cannot spend. */
export const TEST_XPUB =
  'tpubDDTyJEgNqk6uZKJ6vdM1HdNytMarfrTJBkQH1MGSiYrCnPrkXr1642ndLRb1FbDYBRbHzrq25w2MsGrRrEZziNj1v3BQcmxjYqAMc4iaVQ6';

/**
 * The chain, under the test's control.
 *
 * Everything else in the money path is the real implementation talking to
 * real Postgres and Redis. Only the two things outside our system — the
 * chain and the price feed — are stood in for, because the alternative is a
 * test that needs bitcoin and a market.
 */
export class FakeChain implements ChainDataProvider {
  private readonly byAddress = new Map<string, AddressChainStatus>();
  /** Every address the watcher asked about, in order — used to assert that
   * a payment nobody is polling can't happen. */
  readonly queried: string[] = [];

  async getStatus(address: string): Promise<AddressChainStatus> {
    this.queried.push(address);
    return (
      this.byAddress.get(address) ?? {
        address,
        confirmedSats: 0,
        pendingSats: 0,
        confirmations: 0,
      }
    );
  }

  /** Simulates a customer sending coins, with a given depth. */
  pay(address: string, confirmedSats: number, confirmations: number): void {
    this.byAddress.set(address, { address, confirmedSats, pendingSats: 0, confirmations });
  }

  /** Simulates a customer having broadcast, with nothing confirmed yet — the
   * state that used to be indistinguishable from not having paid at all. */
  broadcast(address: string, pendingSats: number): void {
    this.byAddress.set(address, { address, confirmedSats: 0, pendingSats, confirmations: 0 });
  }
}

/** Fixed rate, so an assertion about sats is an assertion about our maths
 * rather than about today's market. 1 USD = 1,000 sats. */
export class FixedRateProvider implements BtcRateProvider {
  constructor(private readonly satsPerUnit = 1_000) {}

  async satsPerFiatUnit(): Promise<number> {
    return this.satsPerUnit;
  }
}

export class RecordingNotifier implements PaymentConfirmationNotifier {
  readonly notified: string[] = [];

  async notifyPaymentConfirmed(orderId: string): Promise<void> {
    this.notified.push(orderId);
  }
}

const storeAlwaysOpen = {
  execute: async () => true,
} as AssertStoreOpenForCheckout;

/**
 * Wires the real money path end to end: cart → order → address derivation →
 * chain watch → paid → supplier orders.
 *
 * Deliberately assembled here rather than imported from `composition/
 * container.ts`, which reads `env` and would connect to the development
 * database. The shape is kept identical to the container's — if these
 * diverge, this harness stops testing the thing that ships.
 */
export function buildMoneyPath(
  db: DB,
  redis: Redis,
  options: {
    requiredConfirmations?: number;
    quoteTtlSeconds?: number;
    /** Hours the customer has to pay. Negative in tests that need an order
     * whose deadline is already in the past. */
    orderWindowHours?: number;
  } = {},
) {
  const requiredConfirmations = options.requiredConfirmations ?? 3;

  const products = new DrizzleProductRepository(db);
  const orders = new DrizzleOrderRepository(db);
  const carts = new RedisCartRepository(redis);
  const shippingRates = new DrizzleShippingRateRepository(db);
  const coupons = new DrizzleCouponRepository(db);
  const supplierOffers = new DrizzleSupplierOfferRepository(db);
  const supplierOrders = new DrizzleSupplierOrderRepository(db);
  const paymentStore = new DrizzleBitcoinPaymentStore(db);
  const processed = new RedisProcessedEventStore(redis);

  const chain = new FakeChain();
  const notifier = new RecordingNotifier();
  /** Orders the watcher decided to tell the customer were short. */
  const underpaidNotices: string[] = [];

  const gateway = new OnChainBitcoinPaymentGateway(
    new HdAddressDeriver(TEST_XPUB, networks.testnet),
    new RedisAddressIndexAllocator(redis),
    new FixedRateProvider(),
    paymentStore,
    chain,
    options.quoteTtlSeconds ?? 900,
  );

  const createSupplierOrders = new CreateSupplierOrdersForPaidOrder(
    orders,
    supplierOffers,
    supplierOrders,
    orders,
  );

  // The production wiring: confirming a payment enqueues the sourcing work
  // and the email rather than doing either on the watcher's thread. The
  // worker below is the *actual* worker the process runs — not a re-implementation
  // of it — so these tests cover the transport and the dispatch together, and
  // a refactor that broke either breaks the money path here.
  const jobQueue = new BullMqJobQueue(TEST_REDIS_URL, { attempts: 1, backoffDelayMs: 10 });

  /** The money path enqueues only sourcing and the payment-confirmed email.
   * The rest of the worker's collaborators are wired to fail loudly, so a
   * change that starts enqueueing one of them here can't pass quietly. */
  const unexpected = (name: string) => async (): Promise<never> => {
    throw new Error(`money-path test: ${name} was not expected to run`);
  };

  const jobWorker = createJobWorker(TEST_REDIS_URL, {
    appUrl: 'https://shop.test',
    createSupplierOrdersForPaidOrder: createSupplierOrders,
    paymentConfirmationEmail: notifier,
    getOrderDetail: { execute: unexpected('getOrderDetail') },
    underpaymentEmail: { notifyUnderpaid: unexpected('underpaymentEmail') },
    shipmentEmail: { notifyShipped: unexpected('shipmentEmail') },
    sendOrderConfirmationEmail: { execute: unexpected('sendOrderConfirmationEmail') },
    sendWelcomeEmail: { execute: unexpected('sendWelcomeEmail') },
    requestEmailVerification: { execute: unexpected('requestEmailVerification') },
  });

  const confirmPayment = new ConfirmPayment(
    orders,
    processed,
    new QueuedFulfillmentQueue(jobQueue),
    new QueuedPaymentConfirmationNotifier(jobQueue),
  );

  /** Resolves once the queue has nothing left to do — the async equivalent
   * of the old synchronous call, so assertions don't race the worker. */
  const drainJobs = async (): Promise<void> => {
    for (let i = 0; i < 100; i += 1) {
      const { waiting, active } = await jobQueue.stats();
      if (waiting === 0 && active === 0) return;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error('jobs did not drain within 5s');
  };

  const closeJobs = async (): Promise<void> => {
    await jobWorker.close();
    await jobQueue.close();
  };

  return {
    chain,
    notifier,
    drainJobs,
    closeJobs,
    paymentStore,
    orders,
    supplierOrders,
    placeOrder: new PlaceOrder(
      carts,
      products,
      orders,
      shippingRates,
      coupons,
      storeAlwaysOpen,
      // The real repository: the money path must exercise the availability
      // check the same way production does.
      supplierOffers,
      options.orderWindowHours ?? 24,
    ),
    startCheckout: new StartCheckout(
      orders,
      new PaymentGatewayRegistry([gateway]),
      options.quoteTtlSeconds ?? 900,
      24,
      storeAlwaysOpen,
    ),
    /** The sweep that closes orders whose payment window ran out. Here so a
     * test can prove an in-flight payment isn't expired underneath it. */
    expireStaleCheckouts: new ExpireStaleCheckouts(orders, paymentStore),
    refreshPaymentQuote: new RefreshPaymentQuote(orders, gateway),
    watcher: new WatchBitcoinPayments(
      paymentStore,
      chain,
      confirmPayment,
      new MarkAwaitingConfirmation(orders),
      requiredConfirmations,
      // Real Redis is available here, so the once-only guard is the production
      // one. The notifier itself records rather than mails: what this harness
      // asserts is the money path, and a real enqueue would need a worker for
      // a job none of these tests read.
      new NotifyUnderpaidOnce(processed, {
        async notifyUnderpaid(orderId) {
          underpaidNotices.push(orderId);
        },
      }),
    ),
    underpaidNotices,
    requiredConfirmations,
  };
}
