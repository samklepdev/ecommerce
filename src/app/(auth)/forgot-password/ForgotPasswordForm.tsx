'use client';

import { useActionState } from 'react';

import {
  requestPasswordResetAction,
  type RequestPasswordResetActionResult,
} from '@/app/actions/auth';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import styles from '../AuthForm.module.css';

const initialState: RequestPasswordResetActionResult = {};

export function ForgotPasswordForm() {
  const [state, formAction, isPending] = useActionState(requestPasswordResetAction, initialState);

  return (
    <form action={formAction}>
      <Field label="Email" htmlFor="email" hint="We'll send a reset link if that email has an account.">
        <Input type="email" id="email" name="email" required />
      </Field>

      {state.error && <Alert>{state.error}</Alert>}
      {state.message && <Alert tone="success">{state.message}</Alert>}

      <Button type="submit" disabled={isPending} className={styles.submit}>
        {isPending ? 'Sending…' : 'Send reset link'}
      </Button>
    </form>
  );
}
