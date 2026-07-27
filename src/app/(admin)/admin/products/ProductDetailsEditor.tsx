'use client';

import { useActionState, useState } from 'react';

import {
  updateProductDetailsAction,
  type UpdateProductDetailsActionResult,
} from '@/app/actions/admin/catalog';
import { Input, Textarea } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import styles from './ProductDetailsEditor.module.css';

const initialState: UpdateProductDetailsActionResult = {};

/** Same nonce pattern as `ProductPriceEditor`'s `useResultNonce`. */
function useResultNonce(result: unknown): number {
  const [[prev, nonce], setState] = useState<[unknown, number]>([result, 0]);
  if (prev !== result) {
    setState([result, nonce + 1]);
  }
  return nonce;
}

export interface ProductDetailsEditorProps {
  productId: string;
  name: string;
  description: string | null;
}

/** Always-editable name/description fields — the slug stays permanent
 * (never editable here) so existing bookmarked/shared product URLs never
 * break. */
export function ProductDetailsEditor({ productId, name, description }: ProductDetailsEditorProps) {
  const [state, formAction, isPending] = useActionState(updateProductDetailsAction, initialState);
  const nonce = useResultNonce(state);

  return (
    <form action={formAction} className={styles.form}>
      <input type="hidden" name="productId" value={productId} />
      <Input type="text" name="name" defaultValue={name} aria-label="Product name" required />
      <Textarea
        name="description"
        defaultValue={description ?? ''}
        placeholder="No description"
        aria-label="Description"
        rows={2}
      />
      <Button type="submit" variant="ghost" disabled={isPending} className={styles.saveButton}>
        Save
      </Button>
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
    </form>
  );
}
