'use client';

import { useActionState } from 'react';

import { deleteAccountAction, type DeleteAccountActionResult } from '@/app/actions/account';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import styles from './page.module.css';

const initialState: DeleteAccountActionResult = {};

/** Current-password confirmation is the friction step for this irreversible
 * action — same bar as changing a password — rather than a separate JS
 * confirm() dialog. */
export function DeleteAccountForm() {
  const [state, formAction, isPending] = useActionState(deleteAccountAction, initialState);

  return (
    <form action={formAction} className={styles.form}>
      <Field label="Current password" htmlFor="currentPasswordForDelete">
        <Input type="password" id="currentPasswordForDelete" name="currentPassword" required />
      </Field>

      {state.error && <Alert tone="danger">{state.error}</Alert>}

      <Button type="submit" variant="danger" disabled={isPending}>
        {isPending ? 'Deleting…' : 'Delete account'}
      </Button>
    </form>
  );
}
