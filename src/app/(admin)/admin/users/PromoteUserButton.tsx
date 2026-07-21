'use client';

import { useActionState, useState } from 'react';

import {
  promoteUserToAdminAction,
  type PromoteUserToAdminActionResult,
} from '@/app/actions/admin/users';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';

const initialState: PromoteUserToAdminActionResult = {};

function useResultNonce(result: unknown): number {
  const [[prev, nonce], setState] = useState<[unknown, number]>([result, 0]);
  if (prev !== result) {
    setState([result, nonce + 1]);
  }
  return nonce;
}

export interface PromoteUserButtonProps {
  email: string;
}

export function PromoteUserButton({ email }: PromoteUserButtonProps) {
  const [state, formAction, isPending] = useActionState(promoteUserToAdminAction, initialState);
  const nonce = useResultNonce(state);

  return (
    <div>
      <form action={formAction}>
        <input type="hidden" name="email" value={email} />
        <Button type="submit" variant="secondary" disabled={isPending}>
          Promote to admin
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
