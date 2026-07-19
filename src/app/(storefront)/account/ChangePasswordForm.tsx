'use client';

import { useActionState, useState } from 'react';

import { changePasswordAction, type ChangePasswordActionResult } from '@/app/actions/account';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import styles from './page.module.css';

const initialState: ChangePasswordActionResult = {};

function useResultNonce(result: unknown): number {
  const [[prev, nonce], setState] = useState<[unknown, number]>([result, 0]);
  if (prev !== result) {
    setState([result, nonce + 1]);
  }
  return nonce;
}

export function ChangePasswordForm() {
  const [state, formAction, isPending] = useActionState(changePasswordAction, initialState);
  const nonce = useResultNonce(state);

  return (
    <form action={formAction} className={styles.form}>
      <Field label="Current password" htmlFor="currentPassword">
        <Input type="password" id="currentPassword" name="currentPassword" required />
      </Field>
      <Field label="New password" htmlFor="newPassword" hint="At least 8 characters.">
        <Input type="password" id="newPassword" name="newPassword" required minLength={8} />
      </Field>
      <Field label="Confirm new password" htmlFor="confirmPassword">
        <Input type="password" id="confirmPassword" name="confirmPassword" required minLength={8} />
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
        {isPending ? 'Changing…' : 'Change password'}
      </Button>
    </form>
  );
}
