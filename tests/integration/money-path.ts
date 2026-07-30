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
import { ConfirmPayment } from '@/modules/orders/application/use-cases/confirm-payment';
import { MarkAwaitingConfirmation } from '@/modules/orders/application/use-cases/mark-awaiting-confirmation';
import { CreateSupplierOrdersForPaidOrder } from '@/modules/orders/application/use-cases/create-supplier-orders-for-paid-order';
import { SupplierOrderFulfillmentQueue } from '@/modules/orders/infrastructure/supplier-order-fulfillment-queue';
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
      this.byAddress.get(address) ?? { address, confirmedSats: 0, confirmations: 0 }
    );
  }

  /** Simulates a customer sending coins, with a given depth. */
  pay(address: string, confirmedSats: number, confirmations: number): void {
    this.byAddress.set(address, { address, confirmedSats, confirmations });
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
  options: { requiredConfirmations?: number; quoteTtlSeconds?: number } = {},
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

  const gateway = new OnChainBitcoinPaymentGateway(
    new HdAddressDeriver(TEST_XPUB, networks.testnet),
    new RedisAddressIndexAllocator(redis),
    new FixedRateProvider(),
    paymentStore,
    options.quoteTtlSeconds ?? 900,
  );

  const createSupplierOrders = new CreateSupplierOrdersForPaidOrder(
    orders,
    supplierOffers,
    supplierOrders,
    orders,
  );

  const confirmPayment = new ConfirmPayment(
    orders,
    processed,
    new SupplierOrderFulfillmentQueue(createSupplierOrders),
    notifier,
  );

  return {
    chain,
    notifier,
    paymentStore,
    orders,
    supplierOrders,
    placeOrder: new PlaceOrder(carts, products, orders, shippingRates, coupons, storeAlwaysOpen),
    startCheckout: new StartCheckout(
      orders,
      new PaymentGatewayRegistry([gateway]),
      options.quoteTtlSeconds ?? 900,
      24,
      storeAlwaysOpen,
    ),
    watcher: new WatchBitcoinPayments(
      paymentStore,
      chain,
      confirmPayment,
      new MarkAwaitingConfirmation(orders),
      requiredConfirmations,
    ),
    requiredConfirmations,
  };
}
