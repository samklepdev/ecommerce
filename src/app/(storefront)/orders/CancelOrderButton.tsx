'use client';

import { useActionState, useState } from 'react';

import type { CancelOrderActionResult } from '@/app/actions/orders';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';

const initialState: CancelOrderActionResult = {};

/** Same nonce pattern as `CancelOrderButton`'s `useResultNonce`. */
function useResultNonce(result: unknown): number {
  const [[prev, nonce], setState] = useState<[unknown, number]>([result, 0]);
  if (prev !== result) {
    setState([result, nonce + 1]);
  }
  return nonce;
}

export interface CancelOrderButtonProps {
  orderId: string;
  action: (
    prevState: CancelOrderActionResult | undefined,
    formData: FormData,
  ) => Promise<CancelOrderActionResult>;
}

/** Shared by both the guest order page and the account order page — each
 * passes in whichever server action matches its own access model
 * (ownership-scoped vs. id-only). Only rendered by the caller while the
 * order is still pre-payment. */
export function CancelOrderButton({ orderId, action }: CancelOrderButtonProps) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const nonce = useResultNonce(state);

  return (
    <div>
      <form action={formAction}>
        <input type="hidden" name="orderId" value={orderId} />
        <Button type="submit" variant="danger" disabled={isPending}>
          {isPending ? 'Cancelling…' : 'Cancel order'}
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
