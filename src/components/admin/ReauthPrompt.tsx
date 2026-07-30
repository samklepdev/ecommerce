'use client';

import { useActionState, useEffect } from 'react';

import {
  confirmAdminPasswordAction,
  type ReauthActionResult,
} from '@/app/actions/admin/reauth';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import styles from './ReauthPrompt.module.css';

const initialState: ReauthActionResult = {};

export interface ReauthPromptProps {
  /** What the admin was trying to do, so the prompt explains itself:
   * "Confirm your password to delete this supplier." */
  action: string;
  onConfirmed?: () => void;
}

/**
 * Shown when a destructive action comes back with `reauth_required`.
 *
 * Confirming does not replay the action. That's deliberate: silently
 * carrying out a deletion the moment a password lands turns the prompt into
 * a second confirm dialog, and the admin should get to change their mind
 * after proving who they are. It says so, rather than leaving them
 * wondering whether it worked.
 */
export function ReauthPrompt({ action, onConfirmed }: ReauthPromptProps) {
  const [state, formAction, isPending] = useActionState(
    confirmAdminPasswordAction,
    initialState,
  );

  // Fired as an effect, not during render: calling a parent's callback while
  // rendering is how you get a setState-during-render warning.
  useEffect(() => {
    if (state.ok) onConfirmed?.();
  }, [state.ok, onConfirmed]);

  if (state.ok) {
    return <Alert tone="success">Password confirmed — {action} again to continue.</Alert>;
  }

  return (
    <form action={formAction} className={styles.panel}>
      <p className={styles.title}>Confirm your password</p>
      <p className={styles.note}>
        This one is destructive, and it has been a while since you signed in. Confirm your
        password to {action}.
      </p>
      <div className={styles.row}>
        <Input
          type="password"
          name="password"
          autoComplete="current-password"
          aria-label="Password"
          className={styles.input}
          required
        />
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Confirming…' : 'Confirm'}
        </Button>
      </div>
      {state.error && <Alert tone="danger">{state.error}</Alert>}
    </form>
  );
}
