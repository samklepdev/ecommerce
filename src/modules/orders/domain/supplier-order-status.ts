import { IllegalStatusTransitionError } from './order-status';

export type SupplierOrderStatus = 'needs_ordering' | 'ordered' | 'shipped' | 'cancelled';

const SUPPLIER_ORDER_TRANSITIONS: Record<SupplierOrderStatus, readonly SupplierOrderStatus[]> = {
  needs_ordering: ['ordered', 'cancelled'],
  ordered: ['shipped', 'cancelled'],
  shipped: [],
  cancelled: [],
};

export function assertSupplierOrderTransition(
  from: SupplierOrderStatus,
  to: SupplierOrderStatus,
): void {
  if (!SUPPLIER_ORDER_TRANSITIONS[from].includes(to)) {
    throw new IllegalStatusTransitionError('supplier order', from, to);
  }
}
