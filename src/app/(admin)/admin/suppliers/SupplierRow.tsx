'use client';

import { useActionState, useState } from 'react';

import {
  updateSupplierAction,
  setSupplierActiveAction,
  type UpdateSupplierActionResult,
  type SetSupplierActiveActionResult,
} from '@/app/actions/admin/suppliers';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import styles from './page.module.css';

const updateInitialState: UpdateSupplierActionResult = {};
const toggleInitialState: SetSupplierActiveActionResult = {};

function useResultNonce(result: unknown): number {
  const [[prev, nonce], setState] = useState<[unknown, number]>([result, 0]);
  if (prev !== result) {
    setState([result, nonce + 1]);
  }
  return nonce;
}

export interface SupplierRowProps {
  id: string;
  name: string;
  url: string;
  notes: string | null;
  isActive: boolean;
}

export function SupplierRow({ id, name, url, notes, isActive }: SupplierRowProps) {
  const [updateState, updateFormAction, isUpdatePending] = useActionState(
    updateSupplierAction,
    updateInitialState,
  );
  const [toggleState, toggleFormAction, isTogglePending] = useActionState(
    setSupplierActiveAction,
    toggleInitialState,
  );
  const updateNonce = useResultNonce(updateState);
  const toggleNonce = useResultNonce(toggleState);

  return (
    <tr>
      <td>
        <form action={updateFormAction} className={styles.form}>
          <input type="hidden" name="id" value={id} />
          <Input type="text" name="name" defaultValue={name} aria-label="Supplier name" required />
          <Input type="url" name="url" defaultValue={url} aria-label="Supplier URL" required />
          <Input type="text" name="notes" defaultValue={notes ?? ''} aria-label="Notes" placeholder="Notes" />
          <Button type="submit" variant="ghost" disabled={isUpdatePending}>
            Save
          </Button>
          {updateState.error && (
            <Alert key={updateNonce} tone="danger">
              {updateState.error}
            </Alert>
          )}
          {updateState.message && (
            <Alert key={updateNonce} tone="success">
              {updateState.message}
            </Alert>
          )}
        </form>
      </td>
      <td className={styles.statusCell}>
        <Badge tone={isActive ? 'success' : 'neutral'}>{isActive ? 'active' : 'inactive'}</Badge>
        <form action={toggleFormAction}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="isActive" value={String(!isActive)} />
          <Button type="submit" variant={isActive ? 'danger' : 'secondary'} disabled={isTogglePending}>
            {isActive ? 'Deactivate' : 'Reactivate'}
          </Button>
        </form>
        {toggleState.error && (
          <Alert key={toggleNonce} tone="danger">
            {toggleState.error}
          </Alert>
        )}
        {toggleState.message && (
          <Alert key={toggleNonce} tone="success">
            {toggleState.message}
          </Alert>
        )}
      </td>
    </tr>
  );
}
