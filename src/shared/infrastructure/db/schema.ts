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

export const products = pgTable(
  'products',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    imageUrl: text('image_url'),
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

export const suppliers = pgTable('suppliers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  url: text('url').notNull(),
  notes: text('notes'),
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
    paymentStatus: text('payment_status').notNull().default('pending'),
    fulfillmentStatus: text('fulfillment_status').notNull().default('unfulfilled'),
    // For on-chain BTC this is the order's unique receive address.
    paymentReference: text('payment_reference'),
    customerEmail: text('customer_email').notNull(),
    shippingAddress: jsonb('shipping_address').$type<ShippingAddressJson>(),
    // BTC quote/rate-lock expiry. ExpireStaleCheckouts scans this column.
    paymentWindowExpiresAt: timestamp('payment_window_expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('orders_user_id_idx').on(t.userId),
    expiryScanIdx: index('orders_payment_status_payment_window_expires_at_idx').on(
      t.paymentStatus,
      t.paymentWindowExpiresAt,
    ),
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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // An address must never be reused across orders.
    addressUnique: uniqueIndex('btc_intent_address_unique').on(t.address),
    indexUnique: uniqueIndex('btc_intent_index_unique').on(t.addressIndex),
  }),
);
