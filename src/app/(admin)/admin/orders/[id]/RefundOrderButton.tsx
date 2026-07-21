'use client';

import { useActionState, useState } from 'react';

import {
  markOrderRefundedAction,
  type MarkOrderRefundedActionResult,
} from '@/app/actions/admin/orders';
import type { PaymentStatus } from '@/modules/orders/domain/order-status';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';

const initialState: MarkOrderRefundedActionResult = {};

/** A nonce that bumps whenever `result` is a new object — restarts the
 * alert's fade-out on a repeat submission. Same pattern as
 * `VariantPriceEditor`'s `useResultNonce`. */
function useResultNonce(result: unknown): number {
  const [[prev, nonce], setState] = useState<[unknown, number]>([result, 0]);
  if (prev !== result) {
    setState([result, nonce + 1]);
  }
  return nonce;
}

export interface RefundOrderButtonProps {
  orderId: string;
  paymentStatus: PaymentStatus;
}

/** Records that an order was refunded — the actual refund is a manual,
 * out-of-band on-chain send an admin has already sent; this only updates
 * the durable record. Only shown once an order has actually reached
 * `paid` (the only status `refunded` is a legal transition from). */
export function RefundOrderButton({ orderId, paymentStatus }: RefundOrderButtonProps) {
  const [state, formAction, isPending] = useActionState(markOrderRefundedAction, initialState);
  const nonce = useResultNonce(state);

  if (paymentStatus !== 'paid') return null;

  return (
    <Card>
      <form action={formAction}>
        <input type="hidden" name="orderId" value={orderId} />
        <Button type="submit" variant="danger" disabled={isPending}>
          Mark refunded
        </Button>
      </form>
      {state.error && (
        <Alert key={nonce} tone="danger">
          {state.error}
        </Alert>
      )}
      {state.message && (
        <Alert key={nonce} tone="success">
          {state.message}
        </Alert>
      )}
    </Card>
  );
}
