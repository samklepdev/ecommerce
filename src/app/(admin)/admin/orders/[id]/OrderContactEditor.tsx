'use client';

import { useActionState, useState } from 'react';

import {
  updateOrderContactAction,
  type UpdateOrderContactActionResult,
} from '@/app/actions/admin/orders';
import { ADDRESS_MAX_LENGTH } from '@/app/lib/address-schema';
import { COMMON_COUNTRIES, US_STATES } from '@/shared/domain/address-options';
import { Field } from '@/components/ui/Field';
import { Input, Select } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import styles from './page.module.css';

const initialState: UpdateOrderContactActionResult = {};

export interface OrderContactEditorProps {
  orderId: string;
  customerEmail: string;
  shippingAddress: {
    name: string;
    line1: string;
    line2?: string;
    city: string;
    region: string;
    postalCode: string;
    country: string;
  } | null;
  /** False once the parcel has moved. */
  editable: boolean;
}

/** Correcting who the order is for and where it goes. Stays available on a
 * paid order right up until it ships, because none of it changes what is
 * owed — unlike the items panel next to it. */
export function OrderContactEditor({
  orderId,
  customerEmail,
  shippingAddress,
  editable,
}: OrderContactEditorProps) {
  const [state, formAction, isPending] = useActionState(updateOrderContactAction, initialState);
  // Country drives whether region is a dropdown (US) or free text, exactly as
  // in `CheckoutForm` — the stored convention is the ISO code, so this field
  // can't be a text box an admin types "United Kingdom" into. Left blank when
  // the order has no address, so an email-only correction doesn't submit half
  // of one.
  const [country, setCountry] = useState(shippingAddress?.country ?? '');
  const [region, setRegion] = useState(shippingAddress?.region ?? '');

  if (!editable) {
    return (
      <div className={styles.editorPanel}>
        <h2 className={styles.editorTitle}>Customer details</h2>
        <p className={styles.editorNote}>
          Fixed — this order has shipped.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.editorPanel}>
      <h2 className={styles.editorTitle}>Customer details</h2>
      <p className={styles.editorNote}>
        A typo&apos;d email means the confirmation never arrives; a wrong address means the parcel
        doesn&apos;t either. Both are correctable until it ships.
      </p>

      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.message && <Alert tone="success">{state.message}</Alert>}

      <form action={formAction} className={styles.editorForm}>
        <input type="hidden" name="orderId" value={orderId} />

        <Field label="Email" htmlFor="order-email">
          <Input type="email" id="order-email" name="customerEmail" defaultValue={customerEmail} />
        </Field>

        <div className={styles.editorGrid}>
          <Field label="Name" htmlFor="order-name">
            <Input
              type="text"
              id="order-name"
              name="name"
              defaultValue={shippingAddress?.name ?? ''}
              maxLength={ADDRESS_MAX_LENGTH.name}
            />
          </Field>
          <Field label="Address line 1" htmlFor="order-line1">
            <Input
              type="text"
              id="order-line1"
              name="line1"
              defaultValue={shippingAddress?.line1 ?? ''}
              maxLength={ADDRESS_MAX_LENGTH.line1}
            />
          </Field>
          <Field label="Address line 2" htmlFor="order-line2" hint="Optional">
            <Input
              type="text"
              id="order-line2"
              name="line2"
              defaultValue={shippingAddress?.line2 ?? ''}
              maxLength={ADDRESS_MAX_LENGTH.line2}
            />
          </Field>
          <Field label="City" htmlFor="order-city">
            <Input
              type="text"
              id="order-city"
              name="city"
              defaultValue={shippingAddress?.city ?? ''}
              maxLength={ADDRESS_MAX_LENGTH.city}
            />
          </Field>
          <Field label="State / region" htmlFor="order-region">
            {country === 'US' ? (
              <Select
                id="order-region"
                name="region"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
              >
                <option value="">Select a state</option>
                {US_STATES.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name}
                  </option>
                ))}
              </Select>
            ) : (
              <Input
                type="text"
                id="order-region"
                name="region"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                maxLength={ADDRESS_MAX_LENGTH.region}
              />
            )}
          </Field>
          <Field label="Postal code" htmlFor="order-postal">
            <Input
              type="text"
              id="order-postal"
              name="postalCode"
              defaultValue={shippingAddress?.postalCode ?? ''}
            />
          </Field>
          <Field label="Country" htmlFor="order-country">
            <Select
              id="order-country"
              name="country"
              value={country}
              onChange={(e) => {
                setCountry(e.target.value);
                // A state code means nothing under a different country, and
                // carrying one over would submit it silently.
                setRegion('');
              }}
            >
              <option value="">Select a country</option>
              {COMMON_COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className={styles.editorActions}>
          <Button type="submit" disabled={isPending}>
            {isPending ? 'Saving…' : 'Save details'}
          </Button>
        </div>
      </form>
    </div>
  );
}
