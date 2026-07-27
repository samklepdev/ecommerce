'use client';

import { useActionState, useState } from 'react';

import {
  updateShippingRateAction,
  type UpdateShippingRateActionResult,
} from '@/app/actions/admin/settings';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import styles from './ShippingRateEditor.module.css';

const initialState: UpdateShippingRateActionResult = {};

/** Same nonce pattern as `ProductPriceEditor`'s `useResultNonce` — bumps
 * whenever `result` is a new object, used to `key` the alert so a repeat
 * submission restarts its fade-out. */
function useResultNonce(result: unknown): number {
  const [[prev, nonce], setState] = useState<[unknown, number]>([result, 0]);
  if (prev !== result) {
    setState([result, nonce + 1]);
  }
  return nonce;
}

export interface ShippingRateEditorProps {
  amountMinor: number;
  currency: string;
}

/** Always-editable inline field for the single global flat-rate shipping
 * fee, applied once per order regardless of what's in the cart. Zero is a
 * valid value (free shipping). */
export function ShippingRateEditor({ amountMinor, currency }: ShippingRateEditorProps) {
  const [state, formAction, isPending] = useActionState(updateShippingRateAction, initialState);
  const nonce = useResultNonce(state);

  return (
    <form action={formAction} className={styles.form}>
      <input type="hidden" name="currency" value={currency} />
      <Input
        type="number"
        name="price"
        step="0.01"
        min="0"
        defaultValue={(amountMinor / 100).toFixed(2)}
        aria-label="Shipping price"
        className={styles.priceInput}
      />
      <Button type="submit" variant="secondary" disabled={isPending}>
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
