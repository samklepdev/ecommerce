'use client';

import { useActionState } from 'react';

import { resetPasswordAction, type ResetPasswordActionResult } from '@/app/actions/auth';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import styles from '../../AuthForm.module.css';
import { MIN_PASSWORD_LENGTH, PASSWORD_RULE_TEXT } from '@/shared/domain/password-policy';

const initialState: ResetPasswordActionResult = {};

interface ResetPasswordFormProps {
  token: string;
}

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const [state, formAction, isPending] = useActionState(resetPasswordAction, initialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="token" value={token} />
      <Field label="New password" htmlFor="newPassword" hint={PASSWORD_RULE_TEXT}>
        <Input type="password" id="newPassword" name="newPassword" required minLength={MIN_PASSWORD_LENGTH} />
      </Field>
      <Field label="Confirm new password" htmlFor="confirmPassword">
        <Input type="password" id="confirmPassword" name="confirmPassword" required minLength={MIN_PASSWORD_LENGTH} />
      </Field>

      {state.error && <Alert>{state.error}</Alert>}

      <Button type="submit" disabled={isPending} className={styles.submit}>
        {isPending ? 'Resetting…' : 'Reset password'}
      </Button>
    </form>
  );
}
