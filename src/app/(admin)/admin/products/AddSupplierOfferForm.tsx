'use client';

import { useActionState, useState } from 'react';

import { addSupplierOfferAction, type AddSupplierOfferActionResult } from '@/app/actions/admin/catalog';
import { Input, Select } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import styles from './VariantPriceEditor.module.css';

const initialState: AddSupplierOfferActionResult = {};

/** Same nonce pattern as `VariantPriceEditor`'s `useResultNonce`. */
function useResultNonce(result: unknown): number {
  const [[prev, nonce], setState] = useState<[unknown, number]>([result, 0]);
  if (prev !== result) {
    setState([result, nonce + 1]);
  }
  return nonce;
}

interface Supplier {
  id: string;
  name: string;
}

export interface AddSupplierOfferFormProps {
  variantId: string;
  suppliers: Supplier[];
}

/** Adds a further supplier offer to an existing variant — the same use case
 * "add product" already uses for a variant's first offer. Only becomes
 * preferred if the variant had no offer at all yet, so this never silently
 * steals preference from whatever's already preferred. */
export function AddSupplierOfferForm({ variantId, suppliers }: AddSupplierOfferFormProps) {
  const [state, formAction, isPending] = useActionState(addSupplierOfferAction, initialState);
  const nonce = useResultNonce(state);

  return (
    <form action={formAction} className={styles.form}>
      <input type="hidden" name="variantId" value={variantId} />
      <Select name="supplierId" required defaultValue="" aria-label="Supplier" className={styles.priceInput}>
        <option value="" disabled>
          Add offer from…
        </option>
        {suppliers.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>
      <Input
        type="url"
        name="supplierProductUrl"
        placeholder="Supplier product URL"
        required
        className={styles.priceInput}
      />
      <Input
        type="number"
        name="costAmountMinor"
        step="1"
        min="0"
        placeholder="Cost (minor units)"
        required
        className={styles.priceInput}
      />
      <Button type="submit" variant="ghost" disabled={isPending}>
        Add offer
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
