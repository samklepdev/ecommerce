import { networks } from 'bitcoinjs-lib';

import { env } from '@/config/env';
import { db, type DB } from '@/shared/infrastructure/db/client';
import { redis } from '@/shared/infrastructure/redis/client';
import { RedisRateLimiter } from '@/shared/infrastructure/redis/redis-rate-limiter';
import type { RateLimiter } from '@/shared/application/ports/rate-limiter';

import { StartCheckout } from '@/modules/checkout/application/use-cases/start-checkout';
import { ExpireStaleCheckouts } from '@/modules/checkout/application/use-cases/expire-stale-checkouts';
import { ConfirmPayment } from '@/modules/orders/application/use-cases/confirm-payment';
import { MarkOrderRefunded } from '@/modules/orders/application/use-cases/mark-order-refunded';
import { MarkOrderDelivered } from '@/modules/orders/application/use-cases/mark-order-delivered';
import { CancelOrder } from '@/modules/orders/application/use-cases/cancel-order';
import { MarkAwaitingConfirmation } from '@/modules/orders/application/use-cases/mark-awaiting-confirmation';
import { FailStuckAwaitingConfirmationOrders } from '@/modules/orders/application/use-cases/fail-stuck-awaiting-confirmation-orders';
import { FailOrder } from '@/modules/orders/application/use-cases/fail-order';
import { PlaceOrder } from '@/modules/orders/application/use-cases/place-order';
import { CreateSupplierOrdersForPaidOrder } from '@/modules/orders/application/use-cases/create-supplier-orders-for-paid-order';
import { MarkSupplierOrderOrdered } from '@/modules/orders/application/use-cases/mark-supplier-order-ordered';
import { MarkSupplierOrderShipped } from '@/modules/orders/application/use-cases/mark-supplier-order-shipped';
import { CancelSupplierOrder } from '@/modules/orders/application/use-cases/cancel-supplier-order';
import { UpdateSupplierOrderReference } from '@/modules/orders/application/use-cases/update-supplier-order-reference';
import { UpdateSupplierOrderTrackingNumber } from '@/modules/orders/application/use-cases/update-supplier-order-tracking-number';
import { ListSupplierOrdersByStatus } from '@/modules/orders/application/use-cases/list-supplier-orders-by-status';
import { ListSupplierOrdersNeedingAction } from '@/modules/orders/application/use-cases/list-supplier-orders-needing-action';
import { ListUnfulfillableOrderLines } from '@/modules/orders/application/use-cases/list-unfulfillable-order-lines';
import { GetOrderSummary } from '@/modules/orders/application/use-cases/get-order-summary';
import { ListOrdersForCustomer } from '@/modules/orders/application/use-cases/list-orders-for-customer';
import { ListAllOrdersForAdmin } from '@/modules/orders/application/use-cases/list-all-orders-for-admin';
import { GetOrderDetailForCustomer } from '@/modules/orders/application/use-cases/get-order-detail-for-customer';
import { GetOrderDetail } from '@/modules/orders/application/use-cases/get-order-detail';
import { GetShipmentsForOrder } from '@/modules/orders/application/use-cases/get-shipments-for-order';
import { GetPaymentSessionForOrder } from '@/modules/payments/application/use-cases/get-payment-session-for-order';
import { WatchBitcoinPayments } from '@/modules/payments/application/watch-bitcoin-payments';
import { GetPaymentProgress } from '@/modules/payments/application/use-cases/get-payment-progress';
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
import { EmailPaymentConfirmationNotifier } from '@/modules/orders/infrastructure/email-payment-confirmation-notifier';

import { DrizzleProductRepository } from '@/modules/catalog/infrastructure/drizzle-product-repository';
import { ListProducts } from '@/modules/catalog/application/use-cases/list-products';
import { ListProductCategories } from '@/modules/catalog/application/use-cases/list-product-categories';
import { UpdateProductCategory } from '@/modules/catalog/application/use-cases/update-product-category';
import { UpdateProductDetails } from '@/modules/catalog/application/use-cases/update-product-details';
import { GetProductBySlug } from '@/modules/catalog/application/use-cases/get-product-by-slug';
import { GetProductForVariant } from '@/modules/catalog/application/use-cases/get-product-for-variant';
import { GetProductsByIds } from '@/modules/catalog/application/use-cases/get-products-by-ids';
import { CreateProduct } from '@/modules/catalog/application/use-cases/create-product';
import { CreateProductVariant } from '@/modules/catalog/application/use-cases/create-product-variant';
import { UpdateVariantPrice } from '@/modules/catalog/application/use-cases/update-variant-price';
import { ApplyMarkupToVariants } from '@/modules/catalog/application/use-cases/apply-markup-to-variants';
import { BulkAssignCategory } from '@/modules/catalog/application/use-cases/bulk-assign-category';
import { DrizzleAuditLogRepository } from '@/modules/audit/infrastructure/drizzle-audit-log-repository';
import { RecordAuditLogEntry } from '@/modules/audit/application/use-cases/record-audit-log-entry';
import { ListAuditLogEntries } from '@/modules/audit/application/use-cases/list-audit-log-entries';
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
import { UpdateCartLineQuantity } from '@/modules/cart/application/use-cases/update-cart-line-quantity';
import { RepriceCart } from '@/modules/cart/application/use-cases/reprice-cart';
import { MergeGuestCart } from '@/modules/cart/application/use-cases/merge-guest-cart';
import { ReorderItems } from '@/modules/cart/application/use-cases/reorder-items';

import { DrizzleUserRepository } from '@/modules/identity/infrastructure/drizzle-user-repository';
import { RedisSessionStore } from '@/modules/identity/infrastructure/redis-session-store';
import { SignUp } from '@/modules/identity/application/use-cases/sign-up';
import { LogIn } from '@/modules/identity/application/use-cases/log-in';
import { LogOut } from '@/modules/identity/application/use-cases/log-out';
import { GetCurrentUser } from '@/modules/identity/application/use-cases/get-current-user';
import { ChangePassword } from '@/modules/identity/application/use-cases/change-password';
import { PromoteUserToAdmin } from '@/modules/identity/application/use-cases/promote-user-to-admin';
import { DemoteAdmin } from '@/modules/identity/application/use-cases/demote-admin';
import { FindUserByEmailForAdmin } from '@/modules/identity/application/use-cases/find-user-by-email-for-admin';
import { UpdateAvatar } from '@/modules/identity/application/use-cases/update-avatar';
import { GetAccountProfile } from '@/modules/identity/application/use-cases/get-account-profile';
import { ChangeEmail } from '@/modules/identity/application/use-cases/change-email';
import { DrizzleSavedAddressRepository } from '@/modules/addresses/infrastructure/drizzle-saved-address-repository';
import { ListSavedAddresses } from '@/modules/addresses/application/use-cases/list-saved-addresses';
import { AddSavedAddress } from '@/modules/addresses/application/use-cases/add-saved-address';
import { DeleteSavedAddress } from '@/modules/addresses/application/use-cases/delete-saved-address';
import { SetDefaultSavedAddress } from '@/modules/addresses/application/use-cases/set-default-saved-address';
import { DeleteAccount } from '@/modules/identity/application/use-cases/delete-account';
import { RequestEmailVerification } from '@/modules/identity/application/use-cases/request-email-verification';
import { VerifyEmail } from '@/modules/identity/application/use-cases/verify-email';
import { DrizzleEmailVerificationRepository } from '@/modules/identity/infrastructure/drizzle-email-verification-repository';

import { DrizzleWelcomeEmailRepository } from '@/modules/notifications/infrastructure/drizzle-welcome-email-repository';
import { ConsoleEmailSender } from '@/modules/notifications/infrastructure/console-email-sender';
import { DrizzlePasswordResetRepository } from '@/modules/identity/infrastructure/drizzle-password-reset-repository';
import { RequestPasswordReset } from '@/modules/identity/application/use-cases/request-password-reset';
import { ResetPassword } from '@/modules/identity/application/use-cases/reset-password';
import { SendWelcomeEmail } from '@/modules/notifications/application/use-cases/send-welcome-email';
import { SendOrderConfirmationEmail } from '@/modules/notifications/application/use-cases/send-order-confirmation-email';
import { ResendOrderConfirmations } from '@/modules/orders/application/use-cases/resend-order-confirmations';
import { MarkWelcomeEmailOpened } from '@/modules/notifications/application/use-cases/mark-welcome-email-opened';
import { GetWelcomeEmailStatus } from '@/modules/notifications/application/use-cases/get-welcome-email-status';

import { DrizzleSupplierRepository } from '@/modules/sourcing/infrastructure/drizzle-supplier-repository';
import { DrizzleSupplierOfferRepository } from '@/modules/sourcing/infrastructure/drizzle-supplier-offer-repository';
import { JsonProductFeedFetcher } from '@/modules/sourcing/infrastructure/json-product-feed-fetcher';
import { HtmlUrlContentExtractor } from '@/modules/sourcing/infrastructure/html-url-content-extractor';
import { ListSuppliers } from '@/modules/sourcing/application/use-cases/list-suppliers';
import { CreateSupplier } from '@/modules/sourcing/application/use-cases/create-supplier';
import { CreateSupplierOffer } from '@/modules/sourcing/application/use-cases/create-supplier-offer';
import { UpdateSupplierOfferCost } from '@/modules/sourcing/application/use-cases/update-supplier-offer-cost';
import { SetPreferredSupplierOffer } from '@/modules/sourcing/application/use-cases/set-preferred-supplier-offer';
import { GetPreferredOfferForVariant } from '@/modules/sourcing/application/use-cases/get-preferred-offer-for-variant';
import { ListSupplierOffersForVariant } from '@/modules/sourcing/application/use-cases/list-supplier-offers-for-variant';
import { ImportProductsFromFeed } from '@/modules/sourcing/application/use-cases/import-products-from-feed';
import { ExtractProductFromUrl } from '@/modules/sourcing/application/use-cases/extract-product-from-url';
import { LocalFileImageStorage } from '@/shared/infrastructure/local-file-image-storage';

import { DrizzleShippingRateRepository } from '@/modules/shipping/infrastructure/drizzle-shipping-rate-repository';
import { GetShippingRate } from '@/modules/shipping/application/use-cases/get-shipping-rate';
import { SetShippingRate } from '@/modules/shipping/application/use-cases/set-shipping-rate';

/**
 * The single DI root. Nothing else `new`s an adapter. Routes, actions, and the
 * worker resolve dependencies from here.
 */
export interface Container {
  db: DB;
  rateLimiter: RateLimiter;

  listProducts: ListProducts;
  listProductCategories: ListProductCategories;
  updateProductCategory: UpdateProductCategory;
  updateProductDetails: UpdateProductDetails;
  getProductBySlug: GetProductBySlug;
  getProductForVariant: GetProductForVariant;
  getProductsByIds: GetProductsByIds;
  createProduct: CreateProduct;
  createProductVariant: CreateProductVariant;
  updateVariantPrice: UpdateVariantPrice;
  applyMarkupToVariants: ApplyMarkupToVariants;
  bulkAssignCategory: BulkAssignCategory;
  recordAuditLogEntry: RecordAuditLogEntry;
  listAuditLogEntries: ListAuditLogEntries;
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
  updateCartLineQuantity: UpdateCartLineQuantity;
  repriceCart: RepriceCart;
  mergeGuestCart: MergeGuestCart;
  reorderItems: ReorderItems;

  signUp: SignUp;
  logIn: LogIn;
  logOut: LogOut;
  getCurrentUser: GetCurrentUser;
  changePassword: ChangePassword;
  promoteUserToAdmin: PromoteUserToAdmin;
  demoteAdmin: DemoteAdmin;
  findUserByEmailForAdmin: FindUserByEmailForAdmin;
  updateAvatar: UpdateAvatar;
  getAccountProfile: GetAccountProfile;
  changeEmail: ChangeEmail;
  listSavedAddresses: ListSavedAddresses;
  addSavedAddress: AddSavedAddress;
  deleteSavedAddress: DeleteSavedAddress;
  setDefaultSavedAddress: SetDefaultSavedAddress;
  deleteAccount: DeleteAccount;
  requestEmailVerification: RequestEmailVerification;
  verifyEmail: VerifyEmail;
  requestPasswordReset: RequestPasswordReset;
  resetPassword: ResetPassword;
  sendWelcomeEmail: SendWelcomeEmail;
  sendOrderConfirmationEmail: SendOrderConfirmationEmail;
  resendOrderConfirmations: ResendOrderConfirmations;
  markWelcomeEmailOpened: MarkWelcomeEmailOpened;
  getWelcomeEmailStatus: GetWelcomeEmailStatus;

  listSuppliers: ListSuppliers;
  createSupplier: CreateSupplier;
  createSupplierOffer: CreateSupplierOffer;
  updateSupplierOfferCost: UpdateSupplierOfferCost;
  setPreferredSupplierOffer: SetPreferredSupplierOffer;
  getPreferredOfferForVariant: GetPreferredOfferForVariant;
  listSupplierOffersForVariant: ListSupplierOffersForVariant;
  importProductsFromFeed: ImportProductsFromFeed;
  extractProductFromUrl: ExtractProductFromUrl;

  getShippingRate: GetShippingRate;
  setShippingRate: SetShippingRate;

  placeOrder: PlaceOrder;
  startCheckout: StartCheckout;
  expireStaleCheckouts: ExpireStaleCheckouts;
  confirmPayment: ConfirmPayment;
  markOrderRefunded: MarkOrderRefunded;
  markOrderDelivered: MarkOrderDelivered;
  cancelOrder: CancelOrder;
  markAwaitingConfirmation: MarkAwaitingConfirmation;
  failStuckAwaitingConfirmationOrders: FailStuckAwaitingConfirmationOrders;
  failOrder: FailOrder;
  watchBitcoinPayments: WatchBitcoinPayments;
  getPaymentProgress: GetPaymentProgress;

  createSupplierOrdersForPaidOrder: CreateSupplierOrdersForPaidOrder;
  markSupplierOrderOrdered: MarkSupplierOrderOrdered;
  markSupplierOrderShipped: MarkSupplierOrderShipped;
  cancelSupplierOrder: CancelSupplierOrder;
  updateSupplierOrderReference: UpdateSupplierOrderReference;
  updateSupplierOrderTrackingNumber: UpdateSupplierOrderTrackingNumber;
  listSupplierOrdersByStatus: ListSupplierOrdersByStatus;
  listSupplierOrdersNeedingAction: ListSupplierOrdersNeedingAction;
  listUnfulfillableOrderLines: ListUnfulfillableOrderLines;
  getOrderSummary: GetOrderSummary;
  listOrdersForCustomer: ListOrdersForCustomer;
  listAllOrdersForAdmin: ListAllOrdersForAdmin;
  getOrderDetailForCustomer: GetOrderDetailForCustomer;
  getOrderDetail: GetOrderDetail;
  getShipmentsForOrder: GetShipmentsForOrder;
  getPaymentSessionForOrder: GetPaymentSessionForOrder;

  orders: DrizzleOrderRepository;
  paymentStore: DrizzleBitcoinPaymentStore;
}

function build(): Container {
  const rateLimiter = new RedisRateLimiter(redis);

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
    env.QUOTE_TTL_SECONDS,
  );
  const gateways = new PaymentGatewayRegistry([btcGateway]);

  // --- catalog ---
  const products = new DrizzleProductRepository(db);
  const listProducts = new ListProducts(products);
  const listProductCategories = new ListProductCategories(products);
  const updateProductCategory = new UpdateProductCategory(products);
  const updateProductDetails = new UpdateProductDetails(products);
  const getProductBySlug = new GetProductBySlug(products);
  const getProductForVariant = new GetProductForVariant(products);
  const getProductsByIds = new GetProductsByIds(products);
  const createProduct = new CreateProduct(products);
  const createProductVariant = new CreateProductVariant(products);
  const updateVariantPrice = new UpdateVariantPrice(products);
  const applyMarkupToVariants = new ApplyMarkupToVariants(products);
  const bulkAssignCategory = new BulkAssignCategory(products);
  const auditLogRepository = new DrizzleAuditLogRepository(db);
  const recordAuditLogEntry = new RecordAuditLogEntry(auditLogRepository);
  const listAuditLogEntries = new ListAuditLogEntries(auditLogRepository);
  const listAllProductsForAdmin = new ListAllProductsForAdmin(products);
  const deleteProducts = new DeleteProducts(products);
  const publishProducts = new PublishProducts(products);
  const unpublishProducts = new UnpublishProducts(products);

  // --- cart ---
  const carts = new RedisCartRepository(redis);
  const getCart = new GetCart(carts);
  const addToCart = new AddToCart(carts, products);
  const removeFromCart = new RemoveFromCart(carts);
  const updateCartLineQuantity = new UpdateCartLineQuantity(carts);
  const repriceCart = new RepriceCart(carts, products);
  const mergeGuestCart = new MergeGuestCart(carts);

  // --- identity ---
  const users = new DrizzleUserRepository(db);
  const sessions = new RedisSessionStore(redis);
  const signUp = new SignUp(users);
  const logIn = new LogIn(users, sessions);
  const logOut = new LogOut(sessions);
  const getCurrentUser = new GetCurrentUser(sessions, users);
  const changePassword = new ChangePassword(users);
  const promoteUserToAdmin = new PromoteUserToAdmin(users);
  const demoteAdmin = new DemoteAdmin(users);
  const findUserByEmailForAdmin = new FindUserByEmailForAdmin(users);
  const avatarImageStorage = new LocalFileImageStorage('avatars');
  const updateAvatar = new UpdateAvatar(users, avatarImageStorage);
  const getAccountProfile = new GetAccountProfile(users);
  const changeEmail = new ChangeEmail(users);
  const savedAddresses = new DrizzleSavedAddressRepository(db);
  const listSavedAddresses = new ListSavedAddresses(savedAddresses);
  const addSavedAddress = new AddSavedAddress(savedAddresses);
  const deleteSavedAddress = new DeleteSavedAddress(savedAddresses);
  const setDefaultSavedAddress = new SetDefaultSavedAddress(savedAddresses);
  const deleteAccount = new DeleteAccount(users);

  // --- notifications ---
  const welcomeEmails = new DrizzleWelcomeEmailRepository(db);
  const consoleEmailSender = new ConsoleEmailSender();
  const sendWelcomeEmail = new SendWelcomeEmail(welcomeEmails, consoleEmailSender, env.APP_URL);
  const sendOrderConfirmationEmail = new SendOrderConfirmationEmail(consoleEmailSender);
  const markWelcomeEmailOpened = new MarkWelcomeEmailOpened(welcomeEmails);
  const getWelcomeEmailStatus = new GetWelcomeEmailStatus(welcomeEmails);

  // --- password reset (identity — reuses notifications' generic email sender) ---
  const passwordResetRepository = new DrizzlePasswordResetRepository(db);
  const requestPasswordReset = new RequestPasswordReset(
    users,
    passwordResetRepository,
    consoleEmailSender,
    env.APP_URL,
    env.PASSWORD_RESET_TTL_SECONDS,
  );

  // --- email verification (identity — same email-sender reuse) ---
  const emailVerificationRepository = new DrizzleEmailVerificationRepository(db);
  const requestEmailVerification = new RequestEmailVerification(
    emailVerificationRepository,
    consoleEmailSender,
    env.APP_URL,
    env.EMAIL_VERIFICATION_TTL_SECONDS,
  );
  const verifyEmail = new VerifyEmail(users, emailVerificationRepository);
  const resetPassword = new ResetPassword(users, passwordResetRepository);

  // --- sourcing ---
  const suppliers = new DrizzleSupplierRepository(db);
  const supplierOffers = new DrizzleSupplierOfferRepository(db);
  const listSuppliers = new ListSuppliers(suppliers);
  const createSupplier = new CreateSupplier(suppliers);
  const createSupplierOffer = new CreateSupplierOffer(supplierOffers);
  const updateSupplierOfferCost = new UpdateSupplierOfferCost(supplierOffers);
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

  // --- shipping ---
  const shippingRates = new DrizzleShippingRateRepository(db);
  const getShippingRate = new GetShippingRate(shippingRates);
  const setShippingRate = new SetShippingRate(shippingRates);

  // --- orders / checkout / confirmation / fulfillment ---
  const orders = new DrizzleOrderRepository(db);
  const resendOrderConfirmations = new ResendOrderConfirmations(
    orders,
    sendOrderConfirmationEmail,
    env.APP_URL,
  );
  const supplierOrders = new DrizzleSupplierOrderRepository(db);
  const processed = new RedisProcessedEventStore(redis);

  const placeOrder = new PlaceOrder(carts, products, orders, shippingRates);
  const reorderItems = new ReorderItems(orders, carts, products);
  const startCheckout = new StartCheckout(orders, gateways, env.QUOTE_TTL_SECONDS);
  const expireStaleCheckouts = new ExpireStaleCheckouts(orders);

  const createSupplierOrdersForPaidOrder = new CreateSupplierOrdersForPaidOrder(
    orders,
    supplierOffers,
    supplierOrders,
    orders,
  );
  const fulfillment = new SupplierOrderFulfillmentQueue(createSupplierOrdersForPaidOrder);
  const paymentConfirmationNotifier = new EmailPaymentConfirmationNotifier(
    orders,
    consoleEmailSender,
    env.APP_URL,
  );
  const markSupplierOrderOrdered = new MarkSupplierOrderOrdered(supplierOrders);
  const markSupplierOrderShipped = new MarkSupplierOrderShipped(supplierOrders, orders);
  const cancelSupplierOrder = new CancelSupplierOrder(supplierOrders, orders);
  const updateSupplierOrderReference = new UpdateSupplierOrderReference(supplierOrders);
  const updateSupplierOrderTrackingNumber = new UpdateSupplierOrderTrackingNumber(supplierOrders);
  const listSupplierOrdersByStatus = new ListSupplierOrdersByStatus(supplierOrders);
  const listSupplierOrdersNeedingAction = new ListSupplierOrdersNeedingAction(supplierOrders);
  const listUnfulfillableOrderLines = new ListUnfulfillableOrderLines(orders);
  const getOrderSummary = new GetOrderSummary(orders);
  const listOrdersForCustomer = new ListOrdersForCustomer(orders);
  const listAllOrdersForAdmin = new ListAllOrdersForAdmin(orders);
  const getOrderDetailForCustomer = new GetOrderDetailForCustomer(orders);
  const getOrderDetail = new GetOrderDetail(orders);
  const getShipmentsForOrder = new GetShipmentsForOrder(supplierOrders);
  const getPaymentSessionForOrder = new GetPaymentSessionForOrder(paymentStore);

  const confirmPayment = new ConfirmPayment(orders, processed, fulfillment, paymentConfirmationNotifier);
  const markOrderRefunded = new MarkOrderRefunded(orders);
  const markOrderDelivered = new MarkOrderDelivered(orders);
  const cancelOrder = new CancelOrder(orders, paymentStore);
  const markAwaitingConfirmation = new MarkAwaitingConfirmation(orders);
  const failStuckAwaitingConfirmationOrders = new FailStuckAwaitingConfirmationOrders(orders);
  const failOrder = new FailOrder(orders);
  // One unified number for both the actual gate and the customer-facing
  // "X of Y confirmations" display — BTC_REQUIRED_CONFIRMATIONS stays the
  // documented/nominal requirement, BTC_SETTLEMENT_BUFFER_CONFIRMATIONS is
  // the extra reorg-safety margin layered on top. Never thread the bare
  // env.BTC_REQUIRED_CONFIRMATIONS through on its own below this point.
  const effectiveRequiredConfirmations =
    env.BTC_REQUIRED_CONFIRMATIONS + env.BTC_SETTLEMENT_BUFFER_CONFIRMATIONS;
  const watchBitcoinPayments = new WatchBitcoinPayments(
    paymentStore,
    chain,
    confirmPayment,
    markAwaitingConfirmation,
    effectiveRequiredConfirmations,
  );
  const getPaymentProgress = new GetPaymentProgress(orders, paymentStore, effectiveRequiredConfirmations);

  return {
    db,
    rateLimiter,
    listProducts,
    listProductCategories,
    updateProductCategory,
    updateProductDetails,
    getProductBySlug,
    getProductForVariant,
    getProductsByIds,
    createProduct,
    createProductVariant,
    updateVariantPrice,
    applyMarkupToVariants,
    bulkAssignCategory,
    recordAuditLogEntry,
    listAuditLogEntries,
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
    updateCartLineQuantity,
    repriceCart,
    mergeGuestCart,
    reorderItems,
    signUp,
    logIn,
    logOut,
    getCurrentUser,
    changePassword,
    promoteUserToAdmin,
    demoteAdmin,
    findUserByEmailForAdmin,
    updateAvatar,
    getAccountProfile,
    changeEmail,
    listSavedAddresses,
    addSavedAddress,
    deleteSavedAddress,
    setDefaultSavedAddress,
    deleteAccount,
    requestEmailVerification,
    verifyEmail,
    requestPasswordReset,
    resetPassword,
    sendWelcomeEmail,
    sendOrderConfirmationEmail,
    resendOrderConfirmations,
    markWelcomeEmailOpened,
    getWelcomeEmailStatus,
    listSuppliers,
    createSupplier,
    createSupplierOffer,
    updateSupplierOfferCost,
    setPreferredSupplierOffer,
    getPreferredOfferForVariant,
    listSupplierOffersForVariant,
    importProductsFromFeed,
    extractProductFromUrl,
    getShippingRate,
    setShippingRate,
    placeOrder,
    startCheckout,
    expireStaleCheckouts,
    confirmPayment,
    markOrderRefunded,
    markOrderDelivered,
    cancelOrder,
    markAwaitingConfirmation,
    failStuckAwaitingConfirmationOrders,
    failOrder,
    watchBitcoinPayments,
    getPaymentProgress,
    createSupplierOrdersForPaidOrder,
    markSupplierOrderOrdered,
    markSupplierOrderShipped,
    cancelSupplierOrder,
    updateSupplierOrderReference,
    updateSupplierOrderTrackingNumber,
    listSupplierOrdersByStatus,
    listSupplierOrdersNeedingAction,
    listUnfulfillableOrderLines,
    getOrderSummary,
    listOrdersForCustomer,
    listAllOrdersForAdmin,
    getOrderDetailForCustomer,
    getOrderDetail,
    getShipmentsForOrder,
    getPaymentSessionForOrder,
    orders,
    paymentStore,
  };
}

const globalForContainer = globalThis as unknown as { __container?: Container };

export function getContainer(): Container {
  if (!globalForContainer.__container) globalForContainer.__container = build();
  return globalForContainer.__container;
}
