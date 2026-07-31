'use client';

import { useActionState, useState } from 'react';

import {
  setCouponActiveAction,
  deleteCouponAction,
  type SetCouponActiveActionResult,
  type DeleteCouponActionResult,
} from '@/app/actions/admin/coupons';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { ReauthPrompt } from '@/components/admin/ReauthPrompt';
import { REAUTH_REQUIRED } from '@/app/lib/session-constants';
import styles from './page.module.css';

const initialState: SetCouponActiveActionResult = {};
const deleteInitialState: DeleteCouponActionResult = {};

function useResultNonce(result: unknown): number {
  const [[prev, nonce], setState] = useState<[unknown, number]>([result, 0]);
  if (prev !== result) {
    setState([result, nonce + 1]);
  }
  return nonce;
}

export interface CouponRowProps {
  id: string;
  code: string;
  discountDisplay: string;
  isActive: boolean;
}

export function CouponRow({ id, code, discountDisplay, isActive }: CouponRowProps) {
  const [state, formAction, isTogglePending] = useActionState(setCouponActiveAction, initialState);
  const [deleteState, deleteFormAction, isDeletePending] = useActionState(
    deleteCouponAction,
    deleteInitialState,
  );
  const isPending = isTogglePending || isDeletePending;
  const nonce = useResultNonce(state);
  const deleteNonce = useResultNonce(deleteState);

  return (
    <tr>
      <td>{code}</td>
      <td>{discountDisplay}</td>
      <td className={styles.statusCell}>
        <Badge tone={isActive ? 'success' : 'neutral'}>{isActive ? 'active' : 'inactive'}</Badge>
        {/* One form, two submit buttons — the toggle overrides the action, the
            same shape AdminSuppliersTable uses. Delete carries no `isActive`,
            which its schema doesn't ask for. */}
        <form action={deleteFormAction}>
          <input type="hidden" name="id" value={id} />
          <Button
            type="submit"
            formAction={formAction}
            name="isActive"
            value={String(!isActive)}
            variant={isActive ? 'warning' : 'secondary'}
            disabled={isPending}
          >
            {isActive ? 'Deactivate' : 'Reactivate'}
          </Button>
          {/* Offered even while active, and even if orders used it: an order
              snapshots the code and discount it was given, so nothing
              historical changes. Deactivate is still the reversible choice. */}
          <Button type="submit" variant="danger" disabled={isPending}>
            Delete
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
        {deleteState.error === REAUTH_REQUIRED ? (
          <ReauthPrompt action={`delete "${code}"`} />
        ) : (
          deleteState.error && (
            <Alert key={deleteNonce} tone="danger">
              {deleteState.error}
            </Alert>
          )
        )}
        {deleteState.message && (
          <Alert key={deleteNonce} tone="success">
            {deleteState.message}
          </Alert>
        )}
      </td>
    </tr>
  );
}
