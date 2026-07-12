import type { SupplierOrderStatus } from '@/modules/orders/domain/supplier-order-status';

export interface SupplierOrderLineDraft {
  orderLineId: string;
  variantId: string;
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
  variantId: string;
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
  createdAt: Date;
  lines: SupplierOrderSummaryLine[];
}

export interface SupplierOrderRepository {
  /** One row (+ lines) per distinct supplier. */
  createForPaidOrder(inputs: CreateSupplierOrderInput[]): Promise<void>;
  listNeedingAction(): Promise<SupplierOrderSummary[]>;
  /** Guarded + idempotent: false if not currently `needs_ordering`. */
  markOrdered(supplierOrderId: string, reference: string): Promise<boolean>;
  /** Guarded + idempotent: false if not currently `ordered`. */
  markShipped(supplierOrderId: string, trackingNumber: string): Promise<boolean>;
  allShippedForOrder(orderId: string): Promise<boolean>;
}
