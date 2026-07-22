'use client';

import { useActionState } from 'react';

import { verifyEmailAction, type VerifyEmailActionResult } from '@/app/actions/auth';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import styles from '../../AuthForm.module.css';

const initialState: VerifyEmailActionResult = {};

interface VerifyEmailFormProps {
  token: string;
}

/** A real button click, not an auto-submitting effect on page load — this
 * is a security-relevant POST action (marks the account verified), unlike
 * the welcome-email open-tracking pixel which fires passively and doesn't
 * prove intent (some email clients preload images). */
export function VerifyEmailForm({ token }: VerifyEmailFormProps) {
  const [state, formAction, isPending] = useActionState(verifyEmailAction, initialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="token" value={token} />
      <p>Click below to confirm your email address.</p>

      {state.error && <Alert>{state.error}</Alert>}

      <Button type="submit" disabled={isPending} className={styles.submit}>
        {isPending ? 'Verifying…' : 'Verify email'}
      </Button>
    </form>
  );
}
