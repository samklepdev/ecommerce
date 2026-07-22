'use client';

import { useActionState, useState } from 'react';

import { addSavedAddressAction, type AddSavedAddressActionResult } from '@/app/actions/addresses';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
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
      <Field label="Name" htmlFor="addr-name">
        <Input type="text" id="addr-name" name="name" required />
      </Field>
      <Field label="Address line 1" htmlFor="addr-line1">
        <Input type="text" id="addr-line1" name="line1" required />
      </Field>
      <Field label="Address line 2" htmlFor="addr-line2" hint="Optional">
        <Input type="text" id="addr-line2" name="line2" />
      </Field>
      <Field label="City" htmlFor="addr-city">
        <Input type="text" id="addr-city" name="city" required />
      </Field>
      <Field label="State / region" htmlFor="addr-region">
        <Input type="text" id="addr-region" name="region" />
      </Field>
      <Field label="Postal code" htmlFor="addr-postal">
        <Input type="text" id="addr-postal" name="postalCode" required />
      </Field>
      <Field label="Country" htmlFor="addr-country">
        <Input type="text" id="addr-country" name="country" required defaultValue="US" />
      </Field>

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
