'use client';

import { useActionState, useState } from 'react';

import { addSavedAddressAction, type AddSavedAddressActionResult } from '@/app/actions/addresses';
import { AddressFormFields } from './AddressFormFields';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import styles from './page.module.css';

const initialState: AddSavedAddressActionResult = {};

function useResultNonce(result: unknown): number {
  const [[prev, nonce], setState] = useState<[unknown, number]>([result, 0]);
  if (prev !== result) {
    setState([result, nonce + 1]);
  }
  return nonce;
}

export function AddSavedAddressForm() {
  const [state, formAction, isPending] = useActionState(addSavedAddressAction, initialState);
  const nonce = useResultNonce(state);

  return (
    <form action={formAction} className={styles.form}>
      <AddressFormFields idPrefix="addr" />

      {state.error && (
        <Alert key={nonce} tone="danger" className={styles.fadeAlert}>
          {state.error}
        </Alert>
      )}
      {state.message && (
        <Alert key={nonce} tone="success" className={styles.fadeAlert}>
          {state.message}
        </Alert>
      )}

      <Button type="submit" disabled={isPending}>
        {isPending ? 'Saving…' : 'Add address'}
      </Button>
    </form>
  );
}
