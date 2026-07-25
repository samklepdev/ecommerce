'use client';

import { useActionState, useState } from 'react';

import { submitReviewAction, type SubmitReviewActionResult } from '@/app/actions/reviews';
import { Field } from '@/components/ui/Field';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import styles from './page.module.css';

const initialState: SubmitReviewActionResult = {};

function useResultNonce(result: unknown): number {
  const [[prev, nonce], setState] = useState<[unknown, number]>([result, 0]);
  if (prev !== result) {
    setState([result, nonce + 1]);
  }
  return nonce;
}

export interface WriteReviewFormProps {
  productId: string;
  productSlug: string;
}

export function WriteReviewForm({ productId, productSlug }: WriteReviewFormProps) {
  const [state, formAction, isPending] = useActionState(submitReviewAction, initialState);
  const nonce = useResultNonce(state);

  return (
    <form action={formAction} className={styles.reviewForm}>
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="productSlug" value={productSlug} />

      <Field label="Rating" htmlFor="review-rating">
        <Select id="review-rating" name="rating" defaultValue="5" required>
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {n} star{n === 1 ? '' : 's'}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Title" htmlFor="review-title" hint="Optional">
        <Input type="text" id="review-title" name="title" />
      </Field>
      <Field label="Review" htmlFor="review-body">
        <Textarea id="review-body" name="body" rows={4} required />
      </Field>
      <Field label="Display name" htmlFor="review-author" hint="Optional, shown publicly — defaults to Anonymous">
        <Input type="text" id="review-author" name="authorDisplayName" />
      </Field>

      {state.error && (
        <Alert key={nonce} tone="danger">
          {state.error}
        </Alert>
      )}
      {state.message && (
        <Alert key={nonce} tone="success">
          {state.message}
        </Alert>
      )}

      <Button type="submit" disabled={isPending}>
        {isPending ? 'Submitting…' : 'Submit review'}
      </Button>
    </form>
  );
}
