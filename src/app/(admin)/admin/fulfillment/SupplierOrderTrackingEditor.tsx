'use client';

import { useActionState, useState } from 'react';

import {
  updateSupplierOrderTrackingNumberAction,
  type UpdateSupplierOrderTrackingNumberActionResult,
} from '@/app/actions/admin/fulfillment';
import { KNOWN_CARRIERS, carrierLabel } from '@/shared/domain/carrier-tracking';
import { Input, Select } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import styles from './SupplierOrderReferenceEditor.module.css';

const initialState: UpdateSupplierOrderTrackingNumberActionResult = {};

function useResultNonce(result: unknown): number {
  const [[prev, nonce], setState] = useState<[unknown, number]>([result, 0]);
  if (prev !== result) {
    setState([result, nonce + 1]);
  }
  return nonce;
}

export interface SupplierOrderTrackingEditorProps {
  supplierOrderId: string;
  trackingNumber: string;
  carrier: string | null;
}

/** Always-editable inline tracking-number field — once a supplier order
 * moves past `ordered`, this is the only way to see or correct its
 * tracking number (the entry form disappears once set). */
export function SupplierOrderTrackingEditor({
  supplierOrderId,
  trackingNumber,
  carrier,
}: SupplierOrderTrackingEditorProps) {
  const [state, formAction, isPending] = useActionState(
    updateSupplierOrderTrackingNumberAction,
    initialState,
  );
  const nonce = useResultNonce(state);

  return (
    <form action={formAction} className={styles.form}>
      <input type="hidden" name="supplierOrderId" value={supplierOrderId} />
      <Input
        type="text"
        name="trackingNumber"
        defaultValue={trackingNumber}
        aria-label="Tracking number"
        className={styles.input}
      />
      <Select name="carrier" defaultValue={carrier ?? ''} aria-label="Carrier">
        <option value="">Unspecified</option>
        {KNOWN_CARRIERS.map((c) => (
          <option key={c} value={c}>
            {carrierLabel(c)}
          </option>
        ))}
      </Select>
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
