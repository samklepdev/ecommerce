'use client';

import { useActionState } from 'react';

import { signUpAction, type AuthActionResult } from '@/app/actions/auth';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import styles from '../AuthForm.module.css';

const initialState: AuthActionResult = {};

export function SignUpForm() {
  const [state, formAction, isPending] = useActionState(signUpAction, initialState);

  return (
    <form action={formAction}>
      <Field label="Email" htmlFor="email">
        <Input type="email" id="email" name="email" required />
      </Field>
      <Field label="Password" htmlFor="password" hint="At least 8 characters">
        <Input type="password" id="password" name="password" minLength={8} required />
      </Field>
      <Field label="Confirm password" htmlFor="confirmPassword">
        <Input
          type="password"
          id="confirmPassword"
          name="confirmPassword"
          minLength={8}
          required
        />
      </Field>

      {state.error && <Alert>{state.error}</Alert>}

      <Button type="submit" disabled={isPending} className={styles.submit}>
        {isPending ? 'Creating account…' : 'Sign up'}
      </Button>
    </form>
  );
}
