'use client';

import { useActionState, useState } from 'react';

import {
  updateVariantPriceAction,
  type UpdateVariantPriceActionResult,
} from '@/app/actions/admin/catalog';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import styles from './VariantPriceEditor.module.css';

const initialState: UpdateVariantPriceActionResult = {};

/** A nonce that bumps whenever `result` is a new object — used to `key` the
 * alert so a repeat submission restarts its fade-out. Same pattern as
 * `ProductImagesManager`'s `useResultNonce`. */
function useResultNonce(result: unknown): number {
  const [[prev, nonce], setState] = useState<[unknown, number]>([result, 0]);
  if (prev !== result) {
    setState([result, nonce + 1]);
  }
  return nonce;
}

export interface VariantPriceEditorProps {
  variantId: string;
  priceAmountMinor: number;
  currency: string;
}

/** Always-editable inline price field — no expand/collapse toggle, since
 * this is an occasional admin action, not a frequent one. Sell price is
 * independent of supplier cost; editing it here never touches cost/offer
 * records. */
export function VariantPriceEditor({ variantId, priceAmountMinor, currency }: VariantPriceEditorProps) {
  const [state, formAction, isPending] = useActionState(updateVariantPriceAction, initialState);
  const nonce = useResultNonce(state);

  return (
    <form action={formAction} className={styles.form}>
      <input type="hidden" name="variantId" value={variantId} />
      <input type="hidden" name="currency" value={currency} />
      <Input
        type="number"
        name="price"
        step="0.01"
        min="0"
        defaultValue={(priceAmountMinor / 100).toFixed(2)}
        aria-label="Price"
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
