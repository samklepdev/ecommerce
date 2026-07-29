import { relations, sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/**
 * Durable records live in Postgres. Ephemeral/atomic state (address-index
 * counter, processed-event dedup, sessions, guest carts) lives in Redis.
 */

/** Plain shape for the orders.shipping_address jsonb column (kept local to
 * avoid infra importing the domain VO just for a column type). */
interface ShippingAddressJson {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
}

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(), // app-generated (uuid/ulid)
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role').notNull().default('customer'), // customer | admin
    avatarUrl: text('avatar_url'),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailUnique: uniqueIndex('users_email_unique').on(sql`lower(${t.email})`),
  }),
);

export const welcomeEmails = pgTable(
  'welcome_emails',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    trackingToken: text('tracking_token').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
    openedAt: timestamp('opened_at', { withTimezone: true }),
  },
  (t) => ({
    userIdUnique: uniqueIndex('welcome_emails_user_id_unique').on(t.userId),
    trackingTokenUnique: uniqueIndex('welcome_emails_tracking_token_unique').on(t.trackingToken),
  }),
);

export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Only a hash is stored — the raw token exists only in the emailed link
    // and briefly in memory. A DB dump/read-replica leak of this table alone
    // can't be used to take over an account.
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Unlike welcome_emails, a user can have several historical rows here —
    // only tokenHash needs to be unique.
    tokenHashUnique: uniqueIndex('password_reset_tokens_token_hash_unique').on(t.tokenHash),
    userIdIdx: index('password_reset_tokens_user_id_idx').on(t.userId),
  }),
);

export const emailVerificationTokens = pgTable(
  'email_verification_tokens',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Same "only a hash is stored" rationale as password_reset_tokens.
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tokenHashUnique: uniqueIndex('email_verification_tokens_token_hash_unique').on(t.tokenHash),
    userIdIdx: index('email_verification_tokens_user_id_idx').on(t.userId),
  }),
);

export const savedAddresses = pgTable(
  'saved_addresses',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    line1: text('line1').notNull(),
    line2: text('line2'),
    city: text('city').notNull(),
    region: text('region').notNull(),
    postalCode: text('postal_code').notNull(),
    country: text('country').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdIdx: index('saved_addresses_user_id_idx').on(t.userId),
  }),
);

export const auditLog = pgTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    // set null (not cascade) — an audit entry must outlive the actor's
    // account, same rationale as orders.user_id.
    actorUserId: text('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    // Denormalized snapshot — survives even if the actor account is later
    // deleted or its email changes.
    actorEmail: text('actor_email').notNull(),
    action: text('action').notNull(), // e.g. 'order.refunded'
    targetType: text('target_type').notNull(), // e.g. 'order'
    targetId: text('target_id').notNull(),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    createdAtIdx: index('audit_log_created_at_idx').on(t.createdAt),
  }),
);

/** Best-effort web analytics — page views, searches, cart changes.
 * Admin-only (`/admin/analytics`), never exposed to customers, since this
 * stores IP addresses and user-agents. */
export const analyticsEvents = pgTable(
  'analytics_events',
  {
    id: text('id').primaryKey(),
    eventType: text('event_type').notNull(), // page_view | search | cart_changed
    sessionId: text('session_id'), // guest_session_id or the logged-in user's id
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    path: text('path'),
    referrer: text('referrer'),
    userAgent: text('user_agent'),
    ipAddress: text('ip_address'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    typeCreatedAtIdx: index('analytics_events_type_created_at_idx').on(t.eventType, t.createdAt),
    sessionIdCreatedAtIdx: index('analytics_events_session_id_created_at_idx').on(
      t.sessionId,
      t.createdAt,
    ),
  }),
);

/**
 * A catalog category. Was a free-text column on `products` until 0022, which
 * made "rename a category" an UPDATE across every product holding the old
 * string, and made a typo a second category. It's a row now, so a rename is
 * one write and the products follow.
 *
 * Deleting one leaves its products uncategorized (ON DELETE SET NULL) rather
 * than taking them with it — a category is a label, and losing the label
 * should never lose the thing labelled.
 */
export const categories = pgTable(
  'categories',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    /** URL form, used by the storefront's ?category= filter. */
    slug: text('slug').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    nameUnique: uniqueIndex('categories_name_unique').on(t.name),
    slugUnique: uniqueIndex('categories_slug_unique').on(t.slug),
  }),
);

export const products = pgTable(
  'products',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    imageUrl: text('image_url'),
    categoryId: text('category_id').references(() => categories.id, { onDelete: 'set null' }),
    status: text('status').notNull().default('draft'), // draft | active | archived
    source: text('source').notNull().default('manual'), // manual | feed_import
    // The product is the sellable unit — these came off `product_variants`
    // when that table was dropped (see 0021), which was 1:1 with products
    // in practice anyway.
    sku: text('sku').notNull(),
    unitAmountMinor: bigint('unit_amount_minor', { mode: 'number' }).notNull(),
    currency: text('currency').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    slugUnique: uniqueIndex('products_slug_unique').on(t.slug),
    skuUnique: uniqueIndex('products_sku_unique').on(t.sku),
    // The storefront filters by category on every catalog page.
    categoryIdx: index('products_category_id_idx').on(t.categoryId),
  }),
);

/** The only relation declared so far. Products carry their category's *name*
 * through the domain (nothing downstream wants an id), and this is what lets
 * `with: { category: true }` hydrate it without every query restating the
 * join. */
export const productsRelations = relations(products, ({ one }) => ({
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  products: many(products),
}));

/**
 * A saved product, per customer.
 *
 * Logged-in only, deliberately: a wishlist that evaporates when a cookie
 * expires isn't one. The cart is the opposite case — it has to work for a
 * guest, so it lives in Redis by session id — and the two shouldn't be
 * confused for each other.
 *
 * Deleting a product removes it from every wishlist (cascade); nothing here
 * is worth keeping once the thing it points at is gone.
 */
export const wishlistItems = pgTable(
  'wishlist_items',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Saving the same product twice is the same wish, not two.
    userProductUnique: uniqueIndex('wishlist_items_user_product_unique').on(t.userId, t.productId),
    userIdx: index('wishlist_items_user_id_idx').on(t.userId),
  }),
);

/**
 * A customer writing in about a product — either a question about one we
 * stock, or a request to source something we don't.
 *
 * Kept as rows rather than only as email, because email is where these go to
 * die: an inbox has no notion of "answered", no link to the product, and no
 * way for a second admin to see one has already been picked up. The email
 * still goes out; this is the record it refers to.
 *
 * `productId` is null for a sourcing request (there is no product yet) and
 * set for a question about an existing one. ON DELETE SET NULL, so removing
 * a product doesn't erase the conversation about it.
 */
export const productInquiries = pgTable(
  'product_inquiries',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(), // question | sourcing
    productId: text('product_id').references(() => products.id, { onDelete: 'set null' }),
    /** Snapshotted: a sourcing request names something we don't stock, and
     * for a question it keeps the subject readable after the product goes. */
    subject: text('subject').notNull(),
    message: text('message').notNull(),
    customerEmail: text('customer_email').notNull(),
    /** Set when the sender was signed in — lets an admin see their orders. */
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    status: text('status').notNull().default('new'), // new | in_progress | closed
    adminNotes: text('admin_notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // The queue is "what's open, oldest first" — this is the index it reads.
    statusCreatedIdx: index('product_inquiries_status_created_at_idx').on(t.status, t.createdAt),
  }),
);

/** Images beyond a product's primary `products.image_url` — e.g. a
 * hover/alternate shot. `position` starts at 1 (0 is reserved for the
 * primary image, which lives on the `products` row itself). */
export const productImages = pgTable(
  'product_images',
  {
    id: text('id').primaryKey(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    position: integer('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    productIdx: index('product_images_product_id_idx').on(t.productId),
  }),
);

/** One review per user per product. Pending until an
 * admin approves it — see `Review.status` for the moderation states. */
export const reviews = pgTable(
  'reviews',
  {
    id: text('id').primaryKey(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    // set null (not cascade) — a review should outlive the reviewer's
    // account, same rationale as orders.user_id.
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    // Free-text, captured at submission time — `User` has no display-name
    // concept today, and showing the raw email would be a privacy leak.
    authorDisplayName: text('author_display_name').notNull(),
    rating: integer('rating').notNull(),
    title: text('title'),
    body: text('body').notNull(),
    status: text('status').notNull().default('pending'), // pending | approved | rejected
    isVerifiedPurchase: boolean('is_verified_purchase').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    productStatusIdx: index('reviews_product_status_idx').on(t.productId, t.status),
    statusIdx: index('reviews_status_idx').on(t.status),
    userProductUnique: uniqueIndex('reviews_user_product_unique').on(t.userId, t.productId),
  }),
);

/** Admin-managed discount codes, applied server-side at PlaceOrder time —
 * see `Coupon.discountAmountFor`. */
export const coupons = pgTable(
  'coupons',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull(),
    discountType: text('discount_type').notNull(), // percentage | fixed_amount
    percentageValue: integer('percentage_value'),
    fixedAmountMinor: bigint('fixed_amount_minor', { mode: 'number' }),
    currency: text('currency'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    codeUnique: uniqueIndex('coupons_code_unique').on(t.code),
  }),
);

export const suppliers = pgTable('suppliers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  url: text('url').notNull(),
  notes: text('notes'),
  // Inactive suppliers drop out of "source from" dropdowns (new product,
  // new supplier offer) but stay selectable in admin filters/history —
  // existing offers/orders referencing them are never affected.
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A candidate source for a product. Cost is admin/ops-only data — never read by
 * any customer-facing repository (see DrizzleProductRepository). Exactly one
 * offer per product may be `isPreferred` (partial unique index below); that's
 * the one CreateSupplierOrdersForPaidOrder buys from.
 */
export const supplierOffers = pgTable(
  'supplier_offers',
  {
    id: text('id').primaryKey(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    supplierId: text('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'restrict' }),
    supplierProductUrl: text('supplier_product_url').notNull(),
    costAmountMinor: bigint('cost_amount_minor', { mode: 'number' }).notNull(),
    costCurrency: text('cost_currency').notNull(),
    isAvailable: boolean('is_available').notNull().default(true),
    isPreferred: boolean('is_preferred').notNull().default(false),
    // Vestigial: bookkeeping for the removed page-scraping sync feature.
    // No longer read or written by the app; left in place rather than
    // migrated away. Safe to drop in a future migration if desired.
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    lastSyncStatus: text('last_sync_status').notNull().default('never'), // never | ok | blocked | error
    lastSyncError: text('last_sync_error'),
    autoSyncEnabled: boolean('auto_sync_enabled').notNull().default(true),
    scrapedTitle: text('scraped_title'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    productIdx: index('supplier_offers_product_id_idx').on(t.productId),
    preferredUnique: uniqueIndex('supplier_offers_preferred_unique')
      .on(t.productId)
      .where(sql`${t.isPreferred} = true`),
  }),
);

export const orders = pgTable(
  'orders',
  {
    id: text('id').primaryKey(), // app-generated (uuid/ulid)
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    currency: text('currency').notNull(), // ISO 4217
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    // Snapshotted from the global shipping rate at PlaceOrder time — never
    // re-read live, so a later admin change doesn't alter historical orders.
    shippingAmountMinor: bigint('shipping_amount_minor', { mode: 'number' }).notNull().default(0),
    paymentStatus: text('payment_status').notNull().default('pending'),
    // Set once, never cleared, when ConfirmPayment recovers an order from
    // expired/cancelled back to paid — durable trace for admin follow-up,
    // not just a log line (mirrors order_lines.fulfillment_issue).
    paymentRecoveredFrom: text('payment_recovered_from'),
    fulfillmentStatus: text('fulfillment_status').notNull().default('unfulfilled'),
    // For on-chain BTC this is the order's unique receive address.
    paymentReference: text('payment_reference'),
    customerEmail: text('customer_email').notNull(),
    shippingAddress: jsonb('shipping_address').$type<ShippingAddressJson>(),
    // BTC quote/rate-lock expiry. ExpireStaleCheckouts scans this column.
    paymentWindowExpiresAt: timestamp('payment_window_expires_at', { withTimezone: true }),
    // Set once, when the order first enters awaiting_confirmation (never
    // touched again on repeat watcher passes) — FailStuckAwaitingConfirmationOrders
    // scans this column for orders that have sat there too long.
    awaitingConfirmationSince: timestamp('awaiting_confirmation_since', { withTimezone: true }),
    // Internal ops notes — admin-only, never shown to customers.
    notes: text('notes'),
    // Snapshotted from the coupon at PlaceOrder time, same rationale as
    // shippingAmountMinor — a later coupon change/deactivation never alters
    // a historical order. 0 / null means no coupon was used.
    discountAmountMinor: bigint('discount_amount_minor', { mode: 'number' }).notNull().default(0),
    couponCode: text('coupon_code'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('orders_user_id_idx').on(t.userId),
    expiryScanIdx: index('orders_payment_status_payment_window_expires_at_idx').on(
      t.paymentStatus,
      t.paymentWindowExpiresAt,
    ),
    stuckAwaitingConfirmationScanIdx: index(
      'orders_payment_status_awaiting_confirmation_since_idx',
    ).on(t.paymentStatus, t.awaitingConfirmationSince),
  }),
);

/** Time-series history of an order's status transitions — the `orders`
 * table only holds current state. No `fromStatus` column: the ordered
 * timeline itself shows the sequence. */
export const orderEvents = pgTable(
  'order_events',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(), // order_created | payment_status_changed | fulfillment_status_changed
    status: text('status').notNull(), // the new value, e.g. 'paid', 'shipped', 'expired'
    metadata: jsonb('metadata'), // amountMinor + lineCount + quantity on order_created
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orderIdx: index('order_events_order_id_idx').on(t.orderId),
    typeCreatedAtIdx: index('order_events_type_created_at_idx').on(t.eventType, t.createdAt),
  }),
);

export const orderLines = pgTable(
  'order_lines',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    productId: text('product_id')
      .notNull()
      .references(() => products.id),
    // Denormalized snapshot at order time — never re-read from the catalog
    // after the order is placed, even if the product's price/sku later changes.
    sku: text('sku').notNull(),
    quantity: integer('quantity').notNull(),
    unitAmountMinor: bigint('unit_amount_minor', { mode: 'number' }).notNull(),
    // Set when CreateSupplierOrdersForPaidOrder can't source this line (no
    // preferred supplier offer) — durable admin-visible flag, not just a
    // log line. Null means no issue.
    fulfillmentIssue: text('fulfillment_issue'),
  },
  (t) => ({
    orderIdx: index('order_lines_order_id_idx').on(t.orderId),
  }),
);

/**
 * The order WE place with a supplier to fulfill part (or all) of a customer
 * order. One customer order can produce more than one of these if its lines
 * split across preferred suppliers.
 */
export const supplierOrders = pgTable(
  'supplier_orders',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    supplierId: text('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'restrict' }),
    status: text('status').notNull().default('needs_ordering'), // needs_ordering | ordered | shipped | cancelled
    supplierOrderReference: text('supplier_order_reference'),
    costTotalMinor: bigint('cost_total_minor', { mode: 'number' }).notNull(),
    costCurrency: text('cost_currency').notNull(),
    trackingNumber: text('tracking_number'),
    // One of KNOWN_CARRIERS (src/shared/domain/carrier-tracking.ts) or null
    // — unset/unrecognized just means no tracking link, never breaks display.
    carrier: text('carrier'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orderIdx: index('supplier_orders_order_id_idx').on(t.orderId),
    statusIdx: index('supplier_orders_status_idx').on(t.status),
  }),
);

export const supplierOrderLines = pgTable(
  'supplier_order_lines',
  {
    id: text('id').primaryKey(),
    supplierOrderId: text('supplier_order_id')
      .notNull()
      .references(() => supplierOrders.id, { onDelete: 'cascade' }),
    orderLineId: text('order_line_id')
      .notNull()
      .references(() => orderLines.id, { onDelete: 'cascade' }),
    productId: text('product_id')
      .notNull()
      .references(() => products.id),
    quantity: integer('quantity').notNull(),
    // Snapshotted at creation — cost drift later shouldn't rewrite history.
    unitCostMinor: bigint('unit_cost_minor', { mode: 'number' }).notNull(),
  },
  (t) => ({
    supplierOrderIdx: index('supplier_order_lines_supplier_order_id_idx').on(t.supplierOrderId),
  }),
);

export const bitcoinPaymentIntents = pgTable(
  'bitcoin_payment_intents',
  {
    orderId: text('order_id')
      .primaryKey()
      .references(() => orders.id, { onDelete: 'cascade' }),
    address: text('address').notNull(),
    addressIndex: integer('address_index').notNull(),
    expectedSats: bigint('expected_sats', { mode: 'number' }).notNull(),
    fiatCurrency: text('fiat_currency').notNull(),
    // A fractional exchange rate (sats per 1 major fiat unit) — not an integer.
    satsPerFiatUnit: doublePrecision('sats_per_fiat_unit').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    status: text('status').notNull().default('awaiting'), // awaiting | confirmed | expired
    // Last confirmation count / underpayment flag the watcher observed —
    // telemetry for the customer-facing status widget, not a status-enum
    // transition itself.
    confirmations: integer('confirmations').notNull().default(0),
    underpaid: boolean('underpaid').notNull().default(false),
    overpaid: boolean('overpaid').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // An address must never be reused across orders.
    addressUnique: uniqueIndex('btc_intent_address_unique').on(t.address),
    indexUnique: uniqueIndex('btc_intent_index_unique').on(t.addressIndex),
  }),
);

/** Single-row store config — `id` is always the fixed value 'default'. */
export const shippingRates = pgTable('shipping_rates', {
  id: text('id').primaryKey(),
  amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
  currency: text('currency').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
