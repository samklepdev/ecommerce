'use client';

import { useActionState, useState } from 'react';

import { createProductVariantAction, type CreateProductVariantActionResult } from '@/app/actions/admin/catalog';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import styles from './VariantPriceEditor.module.css';

const initialState: CreateProductVariantActionResult = {};

/** Same nonce pattern as `VariantPriceEditor`'s `useResultNonce`. */
function useResultNonce(result: unknown): number {
  const [[prev, nonce], setState] = useState<[unknown, number]>([result, 0]);
  if (prev !== result) {
    setState([result, nonce + 1]);
  }
  return nonce;
}

export interface AddVariantFormProps {
  productId: string;
}

/** Adds a second (or further) variant to an existing product. New variants
 * start with no supplier offer — the existing "No supplier offer" badge
 * already handles that state; wiring an offer to it is a separate step,
 * same as it is for the first variant. */
export function AddVariantForm({ productId }: AddVariantFormProps) {
  const [state, formAction, isPending] = useActionState(createProductVariantAction, initialState);
  const nonce = useResultNonce(state);

  return (
    <form action={formAction} className={styles.form}>
      <input type="hidden" name="productId" value={productId} />
      <Input type="text" name="name" placeholder="Variant name" required className={styles.priceInput} />
      <Input type="text" name="sku" placeholder="SKU" required className={styles.priceInput} />
      <Input
        type="number"
        name="unitAmountMinor"
        step="1"
        min="0"
        placeholder="Price (minor units)"
        required
        className={styles.priceInput}
      />
      <input type="hidden" name="currency" value="USD" />
      <Button type="submit" variant="ghost" disabled={isPending}>
        Add variant
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
