import type { FulfillmentStatus, PaymentStatus } from '@/modules/orders/domain/order-status';
import type { SupplierOrderStatus } from '@/modules/orders/domain/supplier-order-status';
import type { SupplierOfferSyncStatus } from '@/modules/sourcing/domain/supplier-offer';
import type { BadgeTone } from '@/components/ui/Badge';

export function paymentStatusTone(status: PaymentStatus): BadgeTone {
  switch (status) {
    case 'paid':
      return 'success';
    case 'failed':
    case 'expired':
      return 'danger';
    case 'refunded':
      return 'warning';
    case 'awaiting_confirmation':
      return 'accent';
    default:
      return 'neutral';
  }
}

export function fulfillmentStatusTone(status: FulfillmentStatus): BadgeTone {
  switch (status) {
    case 'delivered':
    case 'shipped':
      return 'success';
    case 'cancelled':
      return 'danger';
    case 'processing':
      return 'accent';
    default:
      return 'neutral';
  }
}

export function supplierOrderStatusTone(status: SupplierOrderStatus): BadgeTone {
  switch (status) {
    case 'shipped':
      return 'success';
    case 'ordered':
      return 'accent';
    case 'cancelled':
      return 'danger';
    default:
      return 'neutral';
  }
}

export function supplierOfferSyncStatusTone(status: SupplierOfferSyncStatus): BadgeTone {
  switch (status) {
    case 'ok':
      return 'success';
    case 'blocked':
      return 'danger';
    case 'error':
      return 'warning';
    default:
      return 'neutral';
  }
}
