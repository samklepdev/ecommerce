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
  kind: 'question' | 'sourcing';
  /** Required for a question, absent for a sourcing request. */
  productId?: string;
  defaultEmail?: string;
  defaultSubject?: string;
  submitLabel?: string;
}

export function InquiryForm({
  kind,
  productId,
  defaultEmail,
  defaultSubject,
  submitLabel,
}: InquiryFormProps) {
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
        <input type="hidden" name="kind" value={kind} />
        {productId && <input type="hidden" name="productId" value={productId} />}

        <Field label="Your email" htmlFor="inquiryEmail" hint="Where we reply">
          <Input
            type="email"
            id="inquiryEmail"
            name="customerEmail"
            defaultValue={defaultEmail}
            required
          />
        </Field>

        <Field
          label={kind === 'sourcing' ? 'What are you after?' : 'Subject'}
          htmlFor="inquirySubject"
        >
          <Input
            type="text"
            id="inquirySubject"
            name="subject"
            defaultValue={defaultSubject}
            placeholder={kind === 'sourcing' ? 'e.g. Coldcard Q' : undefined}
            required
            minLength={3}
            maxLength={140}
          />
        </Field>

        <Field
          label="Details"
          htmlFor="inquiryMessage"
          hint={
            kind === 'sourcing'
              ? 'A link to the product helps — model, quantity, anything specific'
              : 'The more specific, the better the answer'
          }
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
            {isPending ? 'Sending…' : (submitLabel ?? 'Send')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
