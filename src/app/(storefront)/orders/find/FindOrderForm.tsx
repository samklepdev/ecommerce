'use client';

import { useActionState } from 'react';

import { findOrderAction, type FindOrderActionResult } from '@/app/actions/orders';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import styles from './page.module.css';

const initialState: FindOrderActionResult = {};

export function FindOrderForm() {
  const [state, formAction, isPending] = useActionState(findOrderAction, initialState);

  return (
    <form action={formAction}>
      <Field
        label="Email"
        htmlFor="email"
        hint="We'll resend the confirmation email for any orders under this address."
      >
        <Input type="email" id="email" name="email" required />
      </Field>

      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.message && <Alert tone="success">{state.message}</Alert>}

      <Button type="submit" disabled={isPending} className={styles.submit}>
        {isPending ? 'Sending…' : 'Find my order'}
      </Button>
    </form>
  );
}
