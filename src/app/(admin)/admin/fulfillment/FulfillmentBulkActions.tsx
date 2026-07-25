'use client';

import { useActionState, useState } from 'react';

import {
  bulkMarkSupplierOrdersOrderedAction,
  bulkMarkSupplierOrdersShippedAction,
  bulkCancelSupplierOrdersAction,
  type BulkMarkSupplierOrdersOrderedActionResult,
  type BulkMarkSupplierOrdersShippedActionResult,
  type BulkCancelSupplierOrdersActionResult,
} from '@/app/actions/admin/fulfillment';
import { KNOWN_CARRIERS, carrierLabel } from '@/shared/domain/carrier-tracking';
import { Field } from '@/components/ui/Field';
import { Input, Select } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import styles from './FulfillmentBulkActions.module.css';

const orderedInitialState: BulkMarkSupplierOrdersOrderedActionResult = {};
const shippedInitialState: BulkMarkSupplierOrdersShippedActionResult = {};
const cancelInitialState: BulkCancelSupplierOrdersActionResult = {};

/** Same re-key-the-alert-on-repeat-submission trick used throughout the
 * admin inline editors (e.g. `SupplierOrderReferenceEditor`). */
function useResultNonce(result: unknown): number {
  const [[prev, nonce], setState] = useState<[unknown, number]>([result, 0]);
  if (prev !== result) {
    setState([result, nonce + 1]);
  }
  return nonce;
}

export interface FulfillmentBulkActionsProps {
  orderId: string;
  formId: string;
  hasNeedsOrdering: boolean;
  hasOrdered: boolean;
}

/** Bulk toolbar scoped to one customer order's group of supplier-order
 * cards. Checkboxes on each card (rendered server-side in `page.tsx`) point
 * at `formId` via the HTML `form=` attribute, so selection works without
 * those cards needing to be client components. A shared reference/tracking
 * value applies to every selected row — right when one combined PO or
 * shipment covers several suppliers on the same order; distinct per-row
 * values still go through the existing single-row inline editors. */
export function FulfillmentBulkActions({
  orderId,
  formId,
  hasNeedsOrdering,
  hasOrdered,
}: FulfillmentBulkActionsProps) {
  const [orderedState, orderedFormAction, isOrderedPending] = useActionState(
    bulkMarkSupplierOrdersOrderedAction,
    orderedInitialState,
  );
  const [shippedState, shippedFormAction, isShippedPending] = useActionState(
    bulkMarkSupplierOrdersShippedAction,
    shippedInitialState,
  );
  const [cancelState, cancelFormAction, isCancelPending] = useActionState(
    bulkCancelSupplierOrdersAction,
    cancelInitialState,
  );
  const isPending = isOrderedPending || isShippedPending || isCancelPending;

  const orderedNonce = useResultNonce(orderedState);
  const shippedNonce = useResultNonce(shippedState);
  const cancelNonce = useResultNonce(cancelState);

  if (!hasNeedsOrdering && !hasOrdered) return null;

  return (
    <div className={styles.bulkActions}>
      <form id={formId} action={cancelFormAction} />
      <input type="hidden" name="orderId" value={orderId} form={formId} />

      {orderedState.error && (
        <Alert key={`o-${orderedNonce}`} tone="danger">
          {orderedState.error}
        </Alert>
      )}
      {orderedState.message && (
        <Alert key={`o-${orderedNonce}`} tone="success">
          {orderedState.message}
        </Alert>
      )}
      {shippedState.error && (
        <Alert key={`s-${shippedNonce}`} tone="danger">
          {shippedState.error}
        </Alert>
      )}
      {shippedState.message && (
        <Alert key={`s-${shippedNonce}`} tone="success">
          {shippedState.message}
        </Alert>
      )}
      {cancelState.error && (
        <Alert key={`c-${cancelNonce}`} tone="danger">
          {cancelState.error}
        </Alert>
      )}
      {cancelState.message && (
        <Alert key={`c-${cancelNonce}`} tone="success">
          {cancelState.message}
        </Alert>
      )}

      <div className={styles.groups}>
        {hasNeedsOrdering && (
          <div className={styles.group}>
            <Field label="Reference (applies to all selected)" htmlFor={`bulk-reference-${orderId}`}>
              <Input
                type="text"
                id={`bulk-reference-${orderId}`}
                name="reference"
                form={formId}
                className={styles.input}
              />
            </Field>
            <Button
              type="submit"
              form={formId}
              formAction={orderedFormAction}
              variant="secondary"
              disabled={isPending}
            >
              Mark selected ordered
            </Button>
          </div>
        )}

        {hasOrdered && (
          <div className={styles.group}>
            <Field label="Tracking number (applies to all selected)" htmlFor={`bulk-tracking-${orderId}`}>
              <Input
                type="text"
                id={`bulk-tracking-${orderId}`}
                name="trackingNumber"
                form={formId}
                className={styles.input}
              />
            </Field>
            <Field label="Carrier" htmlFor={`bulk-carrier-${orderId}`}>
              <Select id={`bulk-carrier-${orderId}`} name="carrier" form={formId} defaultValue="">
                <option value="">Unspecified</option>
                {KNOWN_CARRIERS.map((c) => (
                  <option key={c} value={c}>
                    {carrierLabel(c)}
                  </option>
                ))}
              </Select>
            </Field>
            <Button
              type="submit"
              form={formId}
              formAction={shippedFormAction}
              variant="secondary"
              disabled={isPending}
            >
              Mark selected shipped
            </Button>
          </div>
        )}

        <Button type="submit" form={formId} variant="danger" disabled={isPending}>
          Cancel selected
        </Button>
      </div>
    </div>
  );
}
