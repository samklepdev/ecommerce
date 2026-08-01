'use client';

import { useActionState, useState } from 'react';

import {
  markOrderDeliveredAction,
  type MarkOrderDeliveredActionResult,
} from '@/app/actions/admin/orders';
import type { FulfillmentStatus } from '@/modules/orders/domain/order-status';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';

const initialState: MarkOrderDeliveredActionResult = {};

/** Same nonce pattern as `CancelOrderButton`'s `useResultNonce`. */
function useResultNonce(result: unknown): number {
  const [[prev, nonce], setState] = useState<[unknown, number]>([result, 0]);
  if (prev !== result) {
    setState([result, nonce + 1]);
  }
  return nonce;
}

export interface MarkDeliveredButtonProps {
  orderId: string;
  fulfillmentStatus: FulfillmentStatus;
}

/** No carrier webhook exists to detect delivery automatically — an admin
 * records it once the shipment has actually arrived. Only shown once an
 * order has actually shipped (the only status `delivered` is a legal
 * transition from). */
export function MarkDeliveredButton({ orderId, fulfillmentStatus }: MarkDeliveredButtonProps) {
  const [state, formAction, isPending] = useActionState(markOrderDeliveredAction, initialState);
  const nonce = useResultNonce(state);

  if (fulfillmentStatus !== 'shipped') return null;

  return (
    <Card>
      <form action={formAction}>
        <input type="hidden" name="orderId" value={orderId} />
        <Button type="submit" variant="secondary" disabled={isPending}>
          Mark delivered
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
