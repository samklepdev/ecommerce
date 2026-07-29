'use client';

import { useActionState, useState } from 'react';

import { setCouponActiveAction, type SetCouponActiveActionResult } from '@/app/actions/admin/coupons';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import styles from './page.module.css';

const initialState: SetCouponActiveActionResult = {};

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
  const [state, formAction, isPending] = useActionState(setCouponActiveAction, initialState);
  const nonce = useResultNonce(state);

  return (
    <tr>
      <td>{code}</td>
      <td>{discountDisplay}</td>
      <td className={styles.statusCell}>
        <Badge tone={isActive ? 'success' : 'neutral'}>{isActive ? 'active' : 'inactive'}</Badge>
        <form action={formAction}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="isActive" value={String(!isActive)} />
          <Button type="submit" variant={isActive ? 'danger' : 'secondary'} disabled={isPending}>
            {isActive ? 'Deactivate' : 'Reactivate'}
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
      </td>
    </tr>
  );
}
