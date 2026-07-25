import { sql } from 'drizzle-orm';
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

export const products = pgTable(
  'products',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    imageUrl: text('image_url'),
    category: text('category'), // free-text tag; null means uncategorized
    status: text('status').notNull().default('draft'), // draft | active | archived
    source: text('source').notNull().default('manual'), // manual | feed_import
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    slugUnique: uniqueIndex('products_slug_unique').on(t.slug),
  }),
);

export const productVariants = pgTable(
  'product_variants',
  {
    id: text('id').primaryKey(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    sku: text('sku').notNull(),
    name: text('name').notNull(), // e.g. size/color
    unitAmountMinor: bigint('unit_amount_minor', { mode: 'number' }).notNull(),
    currency: text('currency').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    skuUnique: uniqueIndex('product_variants_sku_unique').on(t.sku),
    productIdx: index('product_variants_product_id_idx').on(t.productId),
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

/** One review per user per product (not per-variant). Pending until an
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
 * A candidate source for a variant. Cost is admin/ops-only data — never read by
 * any customer-facing repository (see DrizzleProductRepository). Exactly one
 * offer per variant may be `isPreferred` (partial unique index below); that's
 * the one CreateSupplierOrdersForPaidOrder buys from.
 */
export const supplierOffers = pgTable(
  'supplier_offers',
  {
    id: text('id').primaryKey(),
    variantId: text('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'cascade' }),
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
    variantIdx: index('supplier_offers_variant_id_idx').on(t.variantId),
    preferredUnique: uniqueIndex('supplier_offers_preferred_unique')
      .on(t.variantId)
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

export const orderLines = pgTable(
  'order_lines',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    variantId: text('variant_id')
      .notNull()
      .references(() => productVariants.id),
    // Denormalized snapshot at order time — never re-read from the catalog
    // after the order is placed, even if the variant's price/sku later changes.
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
    variantId: text('variant_id')
      .notNull()
      .references(() => productVariants.id),
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
