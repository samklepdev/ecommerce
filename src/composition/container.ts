import { networks } from 'bitcoinjs-lib';

import { env } from '@/config/env';
import { db, type DB } from '@/shared/infrastructure/db/client';
import { redis } from '@/shared/infrastructure/redis/client';

import { StartCheckout } from '@/modules/checkout/application/use-cases/start-checkout';
import { ExpireStaleCheckouts } from '@/modules/checkout/application/use-cases/expire-stale-checkouts';
import { ConfirmPayment } from '@/modules/orders/application/use-cases/confirm-payment';
import { MarkAwaitingConfirmation } from '@/modules/orders/application/use-cases/mark-awaiting-confirmation';
import { PlaceOrder } from '@/modules/orders/application/use-cases/place-order';
import { CreateSupplierOrdersForPaidOrder } from '@/modules/orders/application/use-cases/create-supplier-orders-for-paid-order';
import { MarkSupplierOrderOrdered } from '@/modules/orders/application/use-cases/mark-supplier-order-ordered';
import { MarkSupplierOrderShipped } from '@/modules/orders/application/use-cases/mark-supplier-order-shipped';
import { ListSupplierOrdersNeedingAction } from '@/modules/orders/application/use-cases/list-supplier-orders-needing-action';
import { GetOrderSummary } from '@/modules/orders/application/use-cases/get-order-summary';
import { WatchBitcoinPayments } from '@/modules/payments/application/watch-bitcoin-payments';
import { PaymentGatewayRegistry } from '@/modules/payments/application/payment-gateway-registry';

import { OnChainBitcoinPaymentGateway } from '@/modules/payments/infrastructure/onchain-bitcoin-payment-gateway';
import { HdAddressDeriver } from '@/modules/payments/infrastructure/bitcoin/address-deriver';
import { EsploraChainDataProvider } from '@/modules/payments/infrastructure/bitcoin/esplora-chain-data-provider';
import { RedisAddressIndexAllocator } from '@/modules/payments/infrastructure/bitcoin/redis-address-index-allocator';
import { DrizzleBitcoinPaymentStore } from '@/modules/payments/infrastructure/bitcoin/drizzle-bitcoin-payment-store';
import { MempoolRateProvider } from '@/modules/payments/infrastructure/bitcoin/mempool-rate-provider';

import { DrizzleOrderRepository } from '@/modules/orders/infrastructure/drizzle-order-repository';
import { DrizzleSupplierOrderRepository } from '@/modules/orders/infrastructure/drizzle-supplier-order-repository';
import { RedisProcessedEventStore } from '@/modules/orders/infrastructure/redis-processed-event-store';
import { SupplierOrderFulfillmentQueue } from '@/modules/orders/infrastructure/supplier-order-fulfillment-queue';

import { DrizzleProductRepository } from '@/modules/catalog/infrastructure/drizzle-product-repository';
import { ListProducts } from '@/modules/catalog/application/use-cases/list-products';
import { GetProductBySlug } from '@/modules/catalog/application/use-cases/get-product-by-slug';
import { CreateProduct } from '@/modules/catalog/application/use-cases/create-product';
import { CreateProductVariant } from '@/modules/catalog/application/use-cases/create-product-variant';
import { ListAllProductsForAdmin } from '@/modules/catalog/application/use-cases/list-all-products-for-admin';
import { DeleteProducts } from '@/modules/catalog/application/use-cases/delete-products';
import { PublishProducts } from '@/modules/catalog/application/use-cases/publish-products';
import { UnpublishProducts } from '@/modules/catalog/application/use-cases/unpublish-products';
import { AddProductImages } from '@/modules/catalog/application/use-cases/add-product-images';
import { RemoveProductImage } from '@/modules/catalog/application/use-cases/remove-product-image';
import { RemovePrimaryProductImage } from '@/modules/catalog/application/use-cases/remove-primary-product-image';

import { RedisCartRepository } from '@/modules/cart/infrastructure/redis-cart-repository';
import { GetCart } from '@/modules/cart/application/use-cases/get-cart';
import { AddToCart } from '@/modules/cart/application/use-cases/add-to-cart';
import { RemoveFromCart } from '@/modules/cart/application/use-cases/remove-from-cart';
import { RepriceCart } from '@/modules/cart/application/use-cases/reprice-cart';
import { MergeGuestCart } from '@/modules/cart/application/use-cases/merge-guest-cart';

import { DrizzleUserRepository } from '@/modules/identity/infrastructure/drizzle-user-repository';
import { RedisSessionStore } from '@/modules/identity/infrastructure/redis-session-store';
import { SignUp } from '@/modules/identity/application/use-cases/sign-up';
import { LogIn } from '@/modules/identity/application/use-cases/log-in';
import { LogOut } from '@/modules/identity/application/use-cases/log-out';
import { GetCurrentUser } from '@/modules/identity/application/use-cases/get-current-user';

import { DrizzleSupplierRepository } from '@/modules/sourcing/infrastructure/drizzle-supplier-repository';
import { DrizzleSupplierOfferRepository } from '@/modules/sourcing/infrastructure/drizzle-supplier-offer-repository';
import { JsonProductFeedFetcher } from '@/modules/sourcing/infrastructure/json-product-feed-fetcher';
import { HtmlUrlContentExtractor } from '@/modules/sourcing/infrastructure/html-url-content-extractor';
import { ListSuppliers } from '@/modules/sourcing/application/use-cases/list-suppliers';
import { CreateSupplier } from '@/modules/sourcing/application/use-cases/create-supplier';
import { CreateSupplierOffer } from '@/modules/sourcing/application/use-cases/create-supplier-offer';
import { SetPreferredSupplierOffer } from '@/modules/sourcing/application/use-cases/set-preferred-supplier-offer';
import { GetPreferredOfferForVariant } from '@/modules/sourcing/application/use-cases/get-preferred-offer-for-variant';
import { ListSupplierOffersForVariant } from '@/modules/sourcing/application/use-cases/list-supplier-offers-for-variant';
import { ImportProductsFromFeed } from '@/modules/sourcing/application/use-cases/import-products-from-feed';
import { ExtractProductFromUrl } from '@/modules/sourcing/application/use-cases/extract-product-from-url';
import { LocalFileImageStorage } from '@/shared/infrastructure/local-file-image-storage';

/**
 * The single DI root. Nothing else `new`s an adapter. Routes, actions, and the
 * worker resolve dependencies from here.
 */
export interface Container {
  db: DB;

  listProducts: ListProducts;
  getProductBySlug: GetProductBySlug;
  createProduct: CreateProduct;
  createProductVariant: CreateProductVariant;
  listAllProductsForAdmin: ListAllProductsForAdmin;
  deleteProducts: DeleteProducts;
  publishProducts: PublishProducts;
  unpublishProducts: UnpublishProducts;
  addProductImages: AddProductImages;
  removeProductImage: RemoveProductImage;
  removePrimaryProductImage: RemovePrimaryProductImage;

  getCart: GetCart;
  addToCart: AddToCart;
  removeFromCart: RemoveFromCart;
  repriceCart: RepriceCart;
  mergeGuestCart: MergeGuestCart;

  signUp: SignUp;
  logIn: LogIn;
  logOut: LogOut;
  getCurrentUser: GetCurrentUser;

  listSuppliers: ListSuppliers;
  createSupplier: CreateSupplier;
  createSupplierOffer: CreateSupplierOffer;
  setPreferredSupplierOffer: SetPreferredSupplierOffer;
  getPreferredOfferForVariant: GetPreferredOfferForVariant;
  listSupplierOffersForVariant: ListSupplierOffersForVariant;
  importProductsFromFeed: ImportProductsFromFeed;
  extractProductFromUrl: ExtractProductFromUrl;

  placeOrder: PlaceOrder;
  startCheckout: StartCheckout;
  expireStaleCheckouts: ExpireStaleCheckouts;
  confirmPayment: ConfirmPayment;
  markAwaitingConfirmation: MarkAwaitingConfirmation;
  watchBitcoinPayments: WatchBitcoinPayments;

  createSupplierOrdersForPaidOrder: CreateSupplierOrdersForPaidOrder;
  markSupplierOrderOrdered: MarkSupplierOrderOrdered;
  markSupplierOrderShipped: MarkSupplierOrderShipped;
  listSupplierOrdersNeedingAction: ListSupplierOrdersNeedingAction;
  getOrderSummary: GetOrderSummary;

  orders: DrizzleOrderRepository;
  paymentStore: DrizzleBitcoinPaymentStore;
}

function build(): Container {
  const network = env.BTC_NETWORK === 'testnet' ? networks.testnet : networks.bitcoin;

  // --- bitcoin infrastructure ---
  const deriver = new HdAddressDeriver(env.BTC_ACCOUNT_XPUB, network);
  const indexAllocator = new RedisAddressIndexAllocator(redis);
  const rates = new MempoolRateProvider(env.BTC_ESPLORA_URL);
  const paymentStore = new DrizzleBitcoinPaymentStore(db);
  const chain = new EsploraChainDataProvider(env.BTC_ESPLORA_URL);

  const btcGateway = new OnChainBitcoinPaymentGateway(
    deriver,
    indexAllocator,
    rates,
    paymentStore,
  );
  const gateways = new PaymentGatewayRegistry([btcGateway]);

  // --- catalog ---
  const products = new DrizzleProductRepository(db);
  const listProducts = new ListProducts(products);
  const getProductBySlug = new GetProductBySlug(products);
  const createProduct = new CreateProduct(products);
  const createProductVariant = new CreateProductVariant(products);
  const listAllProductsForAdmin = new ListAllProductsForAdmin(products);
  const deleteProducts = new DeleteProducts(products);
  const publishProducts = new PublishProducts(products);
  const unpublishProducts = new UnpublishProducts(products);

  // --- cart ---
  const carts = new RedisCartRepository(redis);
  const getCart = new GetCart(carts);
  const addToCart = new AddToCart(carts, products);
  const removeFromCart = new RemoveFromCart(carts);
  const repriceCart = new RepriceCart(carts, products);
  const mergeGuestCart = new MergeGuestCart(carts);

  // --- identity ---
  const users = new DrizzleUserRepository(db);
  const sessions = new RedisSessionStore(redis);
  const signUp = new SignUp(users);
  const logIn = new LogIn(users, sessions);
  const logOut = new LogOut(sessions);
  const getCurrentUser = new GetCurrentUser(sessions, users);

  // --- sourcing ---
  const suppliers = new DrizzleSupplierRepository(db);
  const supplierOffers = new DrizzleSupplierOfferRepository(db);
  const listSuppliers = new ListSuppliers(suppliers);
  const createSupplier = new CreateSupplier(suppliers);
  const createSupplierOffer = new CreateSupplierOffer(supplierOffers);
  const setPreferredSupplierOffer = new SetPreferredSupplierOffer(supplierOffers);
  const getPreferredOfferForVariant = new GetPreferredOfferForVariant(supplierOffers);
  const listSupplierOffersForVariant = new ListSupplierOffersForVariant(supplierOffers);
  const imageStorage = new LocalFileImageStorage();
  const addProductImages = new AddProductImages(products, imageStorage);
  const removeProductImage = new RemoveProductImage(products);
  const removePrimaryProductImage = new RemovePrimaryProductImage(products);
  const supplierFeedFetcher = new JsonProductFeedFetcher();
  const importProductsFromFeed = new ImportProductsFromFeed(
    supplierFeedFetcher,
    products,
    createProduct,
    createProductVariant,
    createSupplierOffer,
    imageStorage,
  );
  const urlContentExtractor = new HtmlUrlContentExtractor();
  const extractProductFromUrl = new ExtractProductFromUrl(urlContentExtractor);

  // --- orders / checkout / confirmation / fulfillment ---
  const orders = new DrizzleOrderRepository(db);
  const supplierOrders = new DrizzleSupplierOrderRepository(db);
  const processed = new RedisProcessedEventStore(redis);

  const placeOrder = new PlaceOrder(carts, products, orders);
  const startCheckout = new StartCheckout(orders, gateways);
  const expireStaleCheckouts = new ExpireStaleCheckouts(orders);

  const createSupplierOrdersForPaidOrder = new CreateSupplierOrdersForPaidOrder(
    orders,
    supplierOffers,
    supplierOrders,
    orders,
  );
  const fulfillment = new SupplierOrderFulfillmentQueue(createSupplierOrdersForPaidOrder);
  const markSupplierOrderOrdered = new MarkSupplierOrderOrdered(supplierOrders);
  const markSupplierOrderShipped = new MarkSupplierOrderShipped(supplierOrders, orders);
  const listSupplierOrdersNeedingAction = new ListSupplierOrdersNeedingAction(supplierOrders);
  const getOrderSummary = new GetOrderSummary(orders);

  const confirmPayment = new ConfirmPayment(orders, processed, fulfillment);
  const markAwaitingConfirmation = new MarkAwaitingConfirmation(orders);
  const watchBitcoinPayments = new WatchBitcoinPayments(
    paymentStore,
    chain,
    confirmPayment,
    markAwaitingConfirmation,
    env.BTC_REQUIRED_CONFIRMATIONS,
  );

  return {
    db,
    listProducts,
    getProductBySlug,
    createProduct,
    createProductVariant,
    listAllProductsForAdmin,
    deleteProducts,
    publishProducts,
    unpublishProducts,
    addProductImages,
    removeProductImage,
    removePrimaryProductImage,
    getCart,
    addToCart,
    removeFromCart,
    repriceCart,
    mergeGuestCart,
    signUp,
    logIn,
    logOut,
    getCurrentUser,
    listSuppliers,
    createSupplier,
    createSupplierOffer,
    setPreferredSupplierOffer,
    getPreferredOfferForVariant,
    listSupplierOffersForVariant,
    importProductsFromFeed,
    extractProductFromUrl,
    placeOrder,
    startCheckout,
    expireStaleCheckouts,
    confirmPayment,
    markAwaitingConfirmation,
    watchBitcoinPayments,
    createSupplierOrdersForPaidOrder,
    markSupplierOrderOrdered,
    markSupplierOrderShipped,
    listSupplierOrdersNeedingAction,
    getOrderSummary,
    orders,
    paymentStore,
  };
}

const globalForContainer = globalThis as unknown as { __container?: Container };

export function getContainer(): Container {
  if (!globalForContainer.__container) globalForContainer.__container = build();
  return globalForContainer.__container;
}
