'use client';

import { useActionState, useState } from 'react';

import { editSavedAddressAction, type EditSavedAddressActionResult } from '@/app/actions/addresses';
import { AddressFormFields, type AddressFormFieldsInitialValues } from './AddressFormFields';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import styles from './page.module.css';

const initialState: EditSavedAddressActionResult = {};

function useResultNonce(result: unknown): number {
  const [[prev, nonce], setState] = useState<[unknown, number]>([result, 0]);
  if (prev !== result) {
    setState([result, nonce + 1]);
  }
  return nonce;
}

export interface EditSavedAddressFormProps {
  id: string;
  initial: AddressFormFieldsInitialValues;
  onCancel: () => void;
}

export function EditSavedAddressForm({ id, initial, onCancel }: EditSavedAddressFormProps) {
  const [state, formAction, isPending] = useActionState(editSavedAddressAction, initialState);
  const nonce = useResultNonce(state);

  return (
    <form action={formAction} className={styles.form}>
      <input type="hidden" name="id" value={id} />
      <AddressFormFields idPrefix={`addr-edit-${id}`} initial={initial} />

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

      <div className={styles.editActions}>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : 'Save address'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isPending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
