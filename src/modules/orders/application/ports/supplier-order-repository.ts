import type { SupplierOrderStatus } from '@/modules/orders/domain/supplier-order-status';

export interface SupplierOrderLineDraft {
  orderLineId: string;
  productId: string;
  quantity: number;
  unitCostMinor: number;
  costCurrency: string;
}

export interface CreateSupplierOrderInput {
  orderId: string;
  supplierId: string;
  lines: SupplierOrderLineDraft[];
}

export interface SupplierOrderSummaryLine {
  productId: string;
  sku: string;
  quantity: number;
  unitCostMinor: number;
}

export interface SupplierOrderSummary {
  id: string;
  orderId: string;
  supplierId: string;
  status: SupplierOrderStatus;
  supplierOrderReference: string | null;
  costTotalMinor: number;
  costCurrency: string;
  trackingNumber: string | null;
  /** One of KNOWN_CARRIERS (src/shared/domain/carrier-tracking.ts) or null. */
  carrier: string | null;
  createdAt: Date;
  lines: SupplierOrderSummaryLine[];
}

export interface SupplierOrderRepository {
  /** One row (+ lines) per distinct supplier. */
  createForPaidOrder(inputs: CreateSupplierOrderInput[]): Promise<void>;
  listNeedingAction(): Promise<SupplierOrderSummary[]>;
  listByOrderId(orderId: string): Promise<SupplierOrderSummary[]>;
  /** `undefined` returns all four statuses. */
  listByStatus(status?: SupplierOrderStatus): Promise<SupplierOrderSummary[]>;
  /** Guarded + idempotent: false if not currently `needs_ordering`. */
  markOrdered(supplierOrderId: string, reference: string): Promise<boolean>;
  /** Guarded + idempotent: false if not currently `ordered`. */
  markShipped(supplierOrderId: string, trackingNumber: string, carrier?: string | null): Promise<boolean>;
  /** Unguarded — edits an already-set reference without re-triggering the
   * needs_ordering -> ordered transition `markOrdered` performs. */
  updateReference(supplierOrderId: string, reference: string): Promise<void>;
  /** Unguarded — edits an already-set tracking number without
   * re-triggering the ordered -> shipped transition `markShipped` performs. */
  updateTrackingNumber(supplierOrderId: string, trackingNumber: string, carrier?: string | null): Promise<void>;
  /** Guarded + idempotent: false unless currently `needs_ordering` or `ordered`. */
  cancel(supplierOrderId: string): Promise<boolean>;
  allShippedForOrder(orderId: string): Promise<boolean>;
  allCancelledForOrder(orderId: string): Promise<boolean>;
}
