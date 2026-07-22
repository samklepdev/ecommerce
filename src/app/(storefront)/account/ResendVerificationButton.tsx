'use client';

import { useActionState, useState } from 'react';

import { resendVerificationAction, type ResendVerificationActionResult } from '@/app/actions/account';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';

const initialState: ResendVerificationActionResult = {};

function useResultNonce(result: unknown): number {
  const [[prev, nonce], setState] = useState<[unknown, number]>([result, 0]);
  if (prev !== result) {
    setState([result, nonce + 1]);
  }
  return nonce;
}

export function ResendVerificationButton() {
  const [state, formAction, isPending] = useActionState(resendVerificationAction, initialState);
  const nonce = useResultNonce(state);

  return (
    <div>
      <form action={formAction}>
        <Button type="submit" variant="secondary" disabled={isPending}>
          {isPending ? 'Sending…' : 'Resend verification email'}
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
