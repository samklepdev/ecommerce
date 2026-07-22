'use client';

import { useActionState, useState } from 'react';

import type { ReorderActionResult } from '@/app/actions/orders';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';

const initialState: ReorderActionResult = {};

/** Same nonce pattern as `CancelOrderButton`'s `useResultNonce`. */
function useResultNonce(result: unknown): number {
  const [[prev, nonce], setState] = useState<[unknown, number]>([result, 0]);
  if (prev !== result) {
    setState([result, nonce + 1]);
  }
  return nonce;
}

export interface ReorderButtonProps {
  orderId: string;
  action: (prevState: ReorderActionResult | undefined, formData: FormData) => Promise<ReorderActionResult>;
}

/** Shared by both the guest order page and the account order page —
 * mirrors CancelOrderButton's exact shape. Re-adds the order's lines to
 * whichever cart the current visitor has, re-priced from the live
 * catalog. */
export function ReorderButton({ orderId, action }: ReorderButtonProps) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const nonce = useResultNonce(state);

  return (
    <div>
      <form action={formAction}>
        <input type="hidden" name="orderId" value={orderId} />
        <Button type="submit" variant="secondary" disabled={isPending}>
          {isPending ? 'Adding to cart…' : 'Reorder'}
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
    </div>
  );
}
