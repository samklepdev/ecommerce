'use client';

import { useActionState, useState } from 'react';

import { updateOrderNotesAction, type UpdateOrderNotesActionResult } from '@/app/actions/admin/orders';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Textarea } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';

const initialState: UpdateOrderNotesActionResult = {};

/** Same nonce pattern as `MarkDeliveredButton`'s `useResultNonce`. */
function useResultNonce(result: unknown): number {
  const [[prev, nonce], setState] = useState<[unknown, number]>([result, 0]);
  if (prev !== result) {
    setState([result, nonce + 1]);
  }
  return nonce;
}

export interface OrderNotesEditorProps {
  orderId: string;
  notes: string | null;
}

/** Internal ops notes — admin-only. Deliberately never rendered inside
 * `OrderDetailView` (shared with the customer-facing order page), same
 * treatment as the `paymentRecoveredFrom` badge next to it. */
export function OrderNotesEditor({ orderId, notes }: OrderNotesEditorProps) {
  const [state, formAction, isPending] = useActionState(updateOrderNotesAction, initialState);
  const nonce = useResultNonce(state);

  return (
    <Card>
      <form action={formAction}>
        <input type="hidden" name="orderId" value={orderId} />
        <Field label="Internal notes" htmlFor={`order-notes-${orderId}`}>
          <Textarea
            id={`order-notes-${orderId}`}
            name="notes"
            defaultValue={notes ?? ''}
            rows={4}
            placeholder="Not visible to the customer."
          />
        </Field>
        <Button type="submit" variant="secondary" disabled={isPending}>
          Save notes
        </Button>
      </form>
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
    </Card>
  );
}
