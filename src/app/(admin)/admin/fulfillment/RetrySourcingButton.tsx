'use client';

import { useActionState, useState } from 'react';

import {
  retrySourcingAction,
  type RetrySourcingActionResult,
} from '@/app/actions/admin/fulfillment';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';

const initialState: RetrySourcingActionResult = {};

/** Same re-key-the-alert-on-repeat-submission trick used throughout the
 * admin inline editors (e.g. `SupplierOrderReferenceEditor`). */
function useResultNonce(result: unknown): number {
  const [[prev, nonce], setState] = useState<[unknown, number]>([result, 0]);
  if (prev !== result) {
    setState([result, nonce + 1]);
  }
  return nonce;
}

export interface RetrySourcingButtonProps {
  orderId: string;
}

/** The way out of a paid order that couldn't be sourced. Add the missing
 * supplier offer, press this, and the order joins the fulfillment queue.
 * Pressing it again is harmless — lines already covered by a supplier order
 * are never re-ordered. */
export function RetrySourcingButton({ orderId }: RetrySourcingButtonProps) {
  const [state, formAction, isPending] = useActionState(retrySourcingAction, initialState);
  const nonce = useResultNonce(state);

  return (
    <form action={formAction}>
      <input type="hidden" name="orderId" value={orderId} />
      <Button type="submit" variant="secondary" disabled={isPending}>
        {isPending ? 'Retrying…' : 'Retry sourcing'}
      </Button>
      {state.error && (
        <Alert key={`e-${nonce}`} tone="danger">
          {state.error}
        </Alert>
      )}
      {state.message && (
        <Alert key={`m-${nonce}`} tone="success">
          {state.message}
        </Alert>
      )}
    </form>
  );
}
