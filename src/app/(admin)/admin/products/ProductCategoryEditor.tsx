'use client';

import { useActionState, useState } from 'react';

import {
  updateProductCategoryAction,
  type UpdateProductCategoryActionResult,
} from '@/app/actions/admin/catalog';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import styles from './VariantPriceEditor.module.css';

const initialState: UpdateProductCategoryActionResult = {};

/** Same nonce pattern as `VariantPriceEditor`'s `useResultNonce`. */
function useResultNonce(result: unknown): number {
  const [[prev, nonce], setState] = useState<[unknown, number]>([result, 0]);
  if (prev !== result) {
    setState([result, nonce + 1]);
  }
  return nonce;
}

export interface ProductCategoryEditorProps {
  productId: string;
  category: string | null;
}

/** Always-editable inline category field, product-level (not per-variant) —
 * backfills existing/imported products, all of which start category-less.
 * An empty value clears the category. */
export function ProductCategoryEditor({ productId, category }: ProductCategoryEditorProps) {
  const [state, formAction, isPending] = useActionState(updateProductCategoryAction, initialState);
  const nonce = useResultNonce(state);

  return (
    <form action={formAction} className={styles.form}>
      <input type="hidden" name="productId" value={productId} />
      <Input
        type="text"
        name="category"
        defaultValue={category ?? ''}
        placeholder="No category"
        aria-label="Category"
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
