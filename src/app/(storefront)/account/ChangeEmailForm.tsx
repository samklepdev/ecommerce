'use client';

import { useActionState, useState } from 'react';

import { changeEmailAction, type ChangeEmailActionResult } from '@/app/actions/account';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import styles from './page.module.css';

const initialState: ChangeEmailActionResult = {};

function useResultNonce(result: unknown): number {
  const [[prev, nonce], setState] = useState<[unknown, number]>([result, 0]);
  if (prev !== result) {
    setState([result, nonce + 1]);
  }
  return nonce;
}

export function ChangeEmailForm() {
  const [state, formAction, isPending] = useActionState(changeEmailAction, initialState);
  const nonce = useResultNonce(state);

  return (
    <form action={formAction} className={styles.form}>
      <Field label="New email" htmlFor="newEmail">
        <Input type="email" id="newEmail" name="newEmail" required />
      </Field>
      <Field label="Current password" htmlFor="currentPasswordForEmail">
        <Input type="password" id="currentPasswordForEmail" name="currentPassword" required />
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
        {isPending ? 'Changing…' : 'Change email'}
      </Button>
    </form>
  );
}
