'use client';

import { useActionState } from 'react';

import { logInAction, type AuthActionResult } from '@/app/actions/auth';

const initialState: AuthActionResult = {};

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(logInAction, initialState);

  return (
    <form action={formAction}>
      <label>
        Email
        <input type="email" name="email" required />
      </label>
      <label>
        Password
        <input type="password" name="password" required />
      </label>
      <button type="submit" disabled={isPending}>
        {isPending ? 'Logging in…' : 'Log in'}
      </button>
      {state.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
