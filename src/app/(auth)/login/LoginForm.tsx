'use client';

import { useActionState } from 'react';

import { logInAction, type AuthActionResult } from '@/app/actions/auth';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import styles from '../AuthForm.module.css';

const initialState: AuthActionResult = {};

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(logInAction, initialState);

  return (
    <form action={formAction}>
      <Field label="Email" htmlFor="email">
        <Input type="email" id="email" name="email" required />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input type="password" id="password" name="password" required />
      </Field>

      {state.error && <Alert>{state.error}</Alert>}

      <Button type="submit" disabled={isPending} className={styles.submit}>
        {isPending ? 'Logging in…' : 'Log in'}
      </Button>
    </form>
  );
}
