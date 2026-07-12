'use client';

import { useActionState } from 'react';

import { signUpAction, type AuthActionResult } from '@/app/actions/auth';

const initialState: AuthActionResult = {};

export function SignUpForm() {
  const [state, formAction, isPending] = useActionState(signUpAction, initialState);

  return (
    <form action={formAction}>
      <label>
        Email
        <input type="email" name="email" required />
      </label>
      <label>
        Password
        <input type="password" name="password" minLength={8} required />
      </label>
      <button type="submit" disabled={isPending}>
        {isPending ? 'Creating account…' : 'Sign up'}
      </button>
      {state.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
