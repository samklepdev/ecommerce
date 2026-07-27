'use client';

import { useActionState, useState } from 'react';

import {
  updateSupplierOfferCostAction,
  type UpdateSupplierOfferCostActionResult,
} from '@/app/actions/admin/catalog';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import styles from './ProductPriceEditor.module.css';

const initialState: UpdateSupplierOfferCostActionResult = {};

/** Same render-time re-keying pattern as `ProductPriceEditor`'s
 * `useResultNonce` — restarts the alert's fade-out on a repeat submission. */
function useResultNonce(result: unknown): number {
  const [[prev, nonce], setState] = useState<[unknown, number]>([result, 0]);
  if (prev !== result) {
    setState([result, nonce + 1]);
  }
  return nonce;
}

export interface SupplierOfferCostEditorProps {
  offerId: string;
  costAmountMinor: number;
  currency: string;
}

/** Always-editable inline cost field, mirroring `ProductPriceEditor` — cost
 * (what the supplier charges) is deliberately independent of the product's
 * sell price; editing one never touches the other. */
export function SupplierOfferCostEditor({ offerId, costAmountMinor, currency }: SupplierOfferCostEditorProps) {
  const [state, formAction, isPending] = useActionState(updateSupplierOfferCostAction, initialState);
  const nonce = useResultNonce(state);

  return (
    <form action={formAction} className={styles.form}>
      <input type="hidden" name="offerId" value={offerId} />
      <input type="hidden" name="currency" value={currency} />
      <Input
        type="number"
        name="cost"
        step="0.01"
        min="0"
        defaultValue={(costAmountMinor / 100).toFixed(2)}
        aria-label="Supplier cost"
        className={styles.priceInput}
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
