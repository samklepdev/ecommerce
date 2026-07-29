'use client';

import { useActionState } from 'react';

import { submitInquiryAction, type SubmitInquiryActionResult } from '@/app/actions/inquiries';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import styles from './InquiryForm.module.css';

const initialState: SubmitInquiryActionResult = {};

export interface InquiryFormProps {
  defaultEmail?: string;
}

export function InquiryForm({ defaultEmail }: InquiryFormProps) {
  const [state, formAction, isPending] = useActionState(submitInquiryAction, initialState);

  // Once it's in, the form is replaced rather than left sitting there
  // inviting a second identical send.
  if (state.message) {
    return (
      <Card className={styles.card}>
        <Alert tone="success">{state.message}</Alert>
      </Card>
    );
  }

  return (
    <Card className={styles.card}>
      <form action={formAction} className={styles.form}>
        <Field label="Your email" htmlFor="inquiryEmail" hint="Where we reply">
          <Input
            type="email"
            id="inquiryEmail"
            name="customerEmail"
            defaultValue={defaultEmail}
            required
          />
        </Field>

        <Field label="What are you after?" htmlFor="inquirySubject">
          <Input
            type="text"
            id="inquirySubject"
            name="subject"
            placeholder="e.g. Coldcard Q"
            required
            minLength={3}
            maxLength={140}
          />
        </Field>

        <Field
          label="Details"
          htmlFor="inquiryMessage"
          hint="A link to the product helps — model, quantity, anything specific"
        >
          <textarea
            id="inquiryMessage"
            name="message"
            className={styles.textarea}
            rows={6}
            required
            minLength={10}
            maxLength={2000}
          />
        </Field>

        {state.error && <Alert tone="danger">{state.error}</Alert>}

        <div className={styles.actions}>
          <Button type="submit" disabled={isPending}>
            {isPending ? 'Sending…' : 'Send request'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
