'use client';

import { useActionState, useState } from 'react';

import {
  setStoreAvailabilityAction,
  type SetStoreAvailabilityActionResult,
} from '@/app/actions/admin/settings';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import styles from './StoreSwitch.module.css';

const initialState: SetStoreAvailabilityActionResult = {};

/** Same nonce pattern as `ShippingRateEditor` — re-keys the alert so a
 * repeat submission restarts its fade-out. */
function useResultNonce(result: unknown): number {
  const [[prev, nonce], setState] = useState<[unknown, number]>([result, 0]);
  if (prev !== result) {
    setState([result, nonce + 1]);
  }
  return nonce;
}

export interface StoreSwitchProps {
  isOpen: boolean;
  closedAt: string | null;
  closedBy: string | null;
  reason: string | null;
}

/**
 * The kill switch.
 *
 * Closing asks for a reason and requires a second click; reopening is one
 * click, because the dangerous direction is the one that stops the business,
 * and the recovery path should never be the fiddly one.
 */
export function StoreSwitch({ isOpen, closedAt, closedBy, reason }: StoreSwitchProps) {
  const [state, formAction, isPending] = useActionState(setStoreAvailabilityAction, initialState);
  const nonce = useResultNonce(state);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className={styles.root}>
      <div className={styles.statusRow}>
        <Badge tone={isOpen ? 'success' : 'danger'}>{isOpen ? 'Open' : 'Closed'}</Badge>
        <span className={styles.statusText}>
          {isOpen ? (
            'Customers can browse and check out.'
          ) : (
            <>
              Closed{closedAt ? ` since ${new Date(closedAt).toLocaleString()}` : ''}
              {closedBy ? ` by ${closedBy}` : ''}
              {reason ? ` — ${reason}` : ''}
            </>
          )}
        </span>
      </div>

      {isOpen ? (
        <form action={formAction} className={styles.form}>
          <input type="hidden" name="isOpen" value="false" />
          {confirming ? (
            <>
              <Input
                name="reason"
                placeholder="Reason (internal, for the audit log)"
                maxLength={200}
                aria-label="Reason for closing"
                className={styles.reason}
              />
              <Button type="submit" variant="danger" disabled={isPending}>
                {isPending ? 'Closing…' : 'Close the store'}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <Button type="button" variant="secondary" onClick={() => setConfirming(true)}>
              Close the store…
            </Button>
          )}
        </form>
      ) : (
        <form action={formAction} className={styles.form}>
          <input type="hidden" name="isOpen" value="true" />
          <Button type="submit" disabled={isPending}>
            {isPending ? 'Reopening…' : 'Reopen the store'}
          </Button>
        </form>
      )}

      <p className={styles.note}>
        Closing stops new orders and shows a paused notice on the storefront. Orders already
        paid keep settling and shipping — the payment watcher is unaffected. Admin stays
        reachable. Also flippable with <code>npm run store:close</code> if this page
        isn&apos;t.
      </p>

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
    </div>
  );
}
