'use client';

import { useActionState, useState } from 'react';

import {
  updateSupplierOrderReferenceAction,
  type UpdateSupplierOrderReferenceActionResult,
} from '@/app/actions/admin/fulfillment';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import styles from './SupplierOrderReferenceEditor.module.css';

const initialState: UpdateSupplierOrderReferenceActionResult = {};

/** A nonce that bumps whenever `result` is a new object — restarts the
 * alert's fade-out on a repeat submission. Same pattern as
 * `ProductPriceEditor`'s `useResultNonce`. */
function useResultNonce(result: unknown): number {
  const [[prev, nonce], setState] = useState<[unknown, number]>([result, 0]);
  if (prev !== result) {
    setState([result, nonce + 1]);
  }
  return nonce;
}

export interface SupplierOrderReferenceEditorProps {
  supplierOrderId: string;
  reference: string;
}

/** Always-editable inline reference field — once a supplier order moves
 * past `needs_ordering`, this is the only way to see or correct its
 * reference (the entry form disappears once set). */
export function SupplierOrderReferenceEditor({ supplierOrderId, reference }: SupplierOrderReferenceEditorProps) {
  const [state, formAction, isPending] = useActionState(updateSupplierOrderReferenceAction, initialState);
  const nonce = useResultNonce(state);

  return (
    <form action={formAction} className={styles.form}>
      <input type="hidden" name="supplierOrderId" value={supplierOrderId} />
      <Input
        type="text"
        name="reference"
        defaultValue={reference}
        aria-label="Supplier order reference"
        className={styles.input}
      />
      <Button type="submit" variant="ghost" disabled={isPending}>
        Save
      </Button>
      {state.error && (
        <Alert key={nonce} tone="danger" className={styles.alert}>
          {state.error}
        </Alert>
      )}
      {state.message && (
        <Alert key={nonce} tone="success" className={styles.alert}>
          {state.message}
        </Alert>
      )}
    </form>
  );
}
