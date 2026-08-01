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

/**
 * Manual override for an order that isn't going to be paid.
 *
 * Offered for every pre-payment status, not just `awaiting_confirmation`:
 * `FailOrder` always permitted all three, but this button only rendered for one
 * of them, so an admin looking at an unpaid order had nothing to click and had
 * to wait out the automatic timers — 24h for expiry, 48h for a part-payment
 * that never completes.
 *
 * The timers still do this on their own. This is for when you already know:
 * a customer who emails to give up, or an order you want off the board now.
 */
export function FailOrderButton({ orderId, paymentStatus }: FailOrderButtonProps) {
  const [state, formAction, isPending] = useActionState(failOrderAction, initialState);
  const nonce = useResultNonce(state);

  // Exactly the statuses `PAYMENT_TRANSITIONS` allows `failed` from. Anything
  // past this has either taken money or already closed.
  const failable =
    paymentStatus === 'pending' ||
    paymentStatus === 'awaiting_payment' ||
    paymentStatus === 'awaiting_confirmation';
  if (!failable) return null;

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
