'use client';

import { useActionState, useState } from 'react';

import {
  cancelOrderFulfillmentAction,
  type CancelOrderFulfillmentActionResult,
} from '@/app/actions/admin/orders';
import type { FulfillmentStatus } from '@/modules/orders/domain/order-status';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Field } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Alert';
import { ReauthPrompt } from '@/components/admin/ReauthPrompt';
import { REAUTH_REQUIRED } from '@/app/lib/session-constants';
import styles from './page.module.css';

const initialState: CancelOrderFulfillmentActionResult = {};

/** Same nonce pattern as `FailOrderButton`'s. */
function useResultNonce(result: unknown): number {
  const [[prev, nonce], setState] = useState<[unknown, number]>([result, 0]);
  if (prev !== result) {
    setState([result, nonce + 1]);
  }
  return nonce;
}

export interface CancelOrderButtonProps {
  orderId: string;
  fulfillmentStatus: FulfillmentStatus;
}

/**
 * Closes out an order the shop isn't going to fulfil — stock that can't be
 * obtained, or a parcel lost in transit.
 *
 * Deliberately available whatever the payment status. Cancelling is the one move
 * that always has to be reachable, or an order in an unexpected state has no way
 * out at all. On a paid order it's terminal and the customer has already parted
 * with money, so it's sudo-gated like the other destructive admin actions and
 * it takes a reason.
 *
 * The reason goes to the audit log only. Nothing here reaches the customer, and
 * the copy is worded so that pasting it somewhere customer-facing still wouldn't
 * say anything about how stock is obtained.
 */
export function CancelOrderButton({ orderId, fulfillmentStatus }: CancelOrderButtonProps) {
  const [state, formAction, isPending] = useActionState(
    cancelOrderFulfillmentAction,
    initialState,
  );
  const nonce = useResultNonce(state);

  // Delivered is the truth about a parcel that arrived; cancelling it would
  // rewrite history rather than record a decision.
  if (fulfillmentStatus === 'delivered' || fulfillmentStatus === 'cancelled') return null;

  return (
    <Card>
      <form action={formAction} className={styles.cancelForm}>
        <p className={styles.cancelNote}>
          Cancel this order — for stock that can&apos;t be obtained, or a parcel lost in
          transit. This does not change the payment record: if the customer paid, the order
          stays paid, and putting that right is a separate step. They are not emailed
          automatically.
        </p>
        <input type="hidden" name="orderId" value={orderId} />
        <Field label="Reason (recorded in the audit log)" htmlFor="cancel-reason">
          <Input type="text" id="cancel-reason" name="reason" required maxLength={500} />
        </Field>
        <Button type="submit" variant="danger" disabled={isPending}>
          {isPending ? 'Cancelling…' : 'Cancel order'}
        </Button>
      </form>
      {state.error === REAUTH_REQUIRED ? (
        <ReauthPrompt action="cancel this order" />
      ) : (
        state.error && (
          <Alert key={nonce} tone="danger">
            {state.error}
          </Alert>
        )
      )}
      {state.message && (
        <Alert key={nonce} tone="success">
          {state.message}
        </Alert>
      )}
    </Card>
  );
}
