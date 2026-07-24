'use client';

import { useActionState, useState } from 'react';

import { failOrderAction, type FailOrderActionResult } from '@/app/actions/admin/orders';
import type { PaymentStatus } from '@/modules/orders/domain/order-status';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';

const initialState: FailOrderActionResult = {};

/** Same nonce pattern as `RefundOrderButton`'s `useResultNonce`. */
function useResultNonce(result: unknown): number {
  const [[prev, nonce], setState] = useState<[unknown, number]>([result, 0]);
  if (prev !== result) {
    setState([result, nonce + 1]);
  }
  return nonce;
}

export interface FailOrderButtonProps {
  orderId: string;
  paymentStatus: PaymentStatus;
}

/** Manual override for an order stuck in awaiting_confirmation (payment
 * seen on-chain, underpaid or too shallow, never resolving) — otherwise
 * FailStuckAwaitingConfirmationOrders resolves it automatically after 48h.
 * Only shown while the order is actually in that status. */
export function FailOrderButton({ orderId, paymentStatus }: FailOrderButtonProps) {
  const [state, formAction, isPending] = useActionState(failOrderAction, initialState);
  const nonce = useResultNonce(state);

  if (paymentStatus !== 'awaiting_confirmation') return null;

  return (
    <Card>
      <form action={formAction}>
        <input type="hidden" name="orderId" value={orderId} />
        <Button type="submit" variant="danger" disabled={isPending}>
          Mark failed
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
