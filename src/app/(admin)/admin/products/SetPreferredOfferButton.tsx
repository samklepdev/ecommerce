'use client';

import { useActionState, useState } from 'react';

import {
  setPreferredSupplierOfferAction,
  type SetPreferredSupplierOfferActionResult,
} from '@/app/actions/admin/catalog';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import styles from './ProductPriceEditor.module.css';

const initialState: SetPreferredSupplierOfferActionResult = {};

/** Same nonce pattern as `ProductPriceEditor`'s `useResultNonce`. */
function useResultNonce(result: unknown): number {
  const [[prev, nonce], setState] = useState<[unknown, number]>([result, 0]);
  if (prev !== result) {
    setState([result, nonce + 1]);
  }
  return nonce;
}

export interface SetPreferredOfferButtonProps {
  offerId: string;
  productId: string;
}

/** Switches which existing offer is preferred for a product — only shown on
 * offers that aren't already preferred. */
export function SetPreferredOfferButton({ offerId, productId }: SetPreferredOfferButtonProps) {
  const [state, formAction, isPending] = useActionState(setPreferredSupplierOfferAction, initialState);
  const nonce = useResultNonce(state);

  return (
    <span>
      <form action={formAction} className={styles.form}>
        <input type="hidden" name="offerId" value={offerId} />
        <input type="hidden" name="productId" value={productId} />
        <Button type="submit" variant="ghost" disabled={isPending}>
          Set preferred
        </Button>
      </form>
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
    </span>
  );
}
