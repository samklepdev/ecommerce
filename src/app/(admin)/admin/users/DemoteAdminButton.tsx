'use client';

import { useActionState, useState } from 'react';

import { demoteAdminAction, type DemoteAdminActionResult } from '@/app/actions/admin/users';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';

const initialState: DemoteAdminActionResult = {};

function useResultNonce(result: unknown): number {
  const [[prev, nonce], setState] = useState<[unknown, number]>([result, 0]);
  if (prev !== result) {
    setState([result, nonce + 1]);
  }
  return nonce;
}

export interface DemoteAdminButtonProps {
  email: string;
}

/** Revokes admin access. The use case itself refuses to demote the acting
 * admin's own account, so this is never shown for the admin viewing this
 * page's own row (see AdminUsersPage). */
export function DemoteAdminButton({ email }: DemoteAdminButtonProps) {
  const [state, formAction, isPending] = useActionState(demoteAdminAction, initialState);
  const nonce = useResultNonce(state);

  return (
    <div>
      <form action={formAction}>
        <input type="hidden" name="email" value={email} />
        <Button type="submit" variant="danger" disabled={isPending}>
          Revoke admin
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
