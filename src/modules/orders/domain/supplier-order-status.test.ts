import { describe, expect, it } from 'vitest';
import {
  assertSupplierOrderTransition,
  type SupplierOrderStatus,
} from './supplier-order-status';
import { IllegalStatusTransitionError } from './order-status';

// NOTE: `assertSupplierOrderTransition` is not currently called anywhere in
// the app — the actual guard for supplier-order transitions lives in
// `DrizzleSupplierOrderRepository`'s guarded SQL WHERE clauses
// (`markOrdered`/`markShipped`/`cancel`) instead. This function is
// effectively dead code today. Tested anyway since it's cheap, correct, and
// exists as a public export — but worth knowing it's not wired into the
// actual enforcement path.

const STATUSES: SupplierOrderStatus[] = ['needs_ordering', 'ordered', 'shipped', 'cancelled'];

const LEGAL: Record<SupplierOrderStatus, SupplierOrderStatus[]> = {
  needs_ordering: ['ordered', 'cancelled'],
  ordered: ['shipped', 'cancelled'],
  shipped: [],
  cancelled: [],
};

describe('assertSupplierOrderTransition', () => {
  for (const from of STATUSES) {
    for (const to of LEGAL[from]) {
      it(`allows ${from} -> ${to}`, () => {
        expect(() => assertSupplierOrderTransition(from, to)).not.toThrow();
      });
    }

    for (const to of STATUSES) {
      if (LEGAL[from].includes(to)) continue;
      it(`rejects ${from} -> ${to}`, () => {
        expect(() => assertSupplierOrderTransition(from, to)).toThrow(IllegalStatusTransitionError);
      });
    }
  }
});
