'use client';

import { useActionState, useRef } from 'react';

import { startCheckoutAction, type StartCheckoutActionResult } from '@/app/actions/checkout';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Input, Select } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import styles from './CheckoutForm.module.css';

const initialState: StartCheckoutActionResult = {};

export interface CheckoutSavedAddress {
  id: string;
  name: string;
  line1: string;
  line2?: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
}

export interface CheckoutFormProps {
  isLoggedIn: boolean;
  savedAddresses: CheckoutSavedAddress[];
}

export function CheckoutForm({ isLoggedIn, savedAddresses }: CheckoutFormProps) {
  const [state, formAction, isPending] = useActionState(startCheckoutAction, initialState);

  const nameRef = useRef<HTMLInputElement>(null);
  const line1Ref = useRef<HTMLInputElement>(null);
  const line2Ref = useRef<HTMLInputElement>(null);
  const cityRef = useRef<HTMLInputElement>(null);
  const regionRef = useRef<HTMLInputElement>(null);
  const postalCodeRef = useRef<HTMLInputElement>(null);
  const countryRef = useRef<HTMLInputElement>(null);

  // Imperative prefill on selection — same pattern AddProductForm uses for
  // its "extract from URL" prefill. The text inputs stay the actual
  // submitted fields; this is purely a convenience autofill.
  function applySavedAddress(id: string) {
    const address = savedAddresses.find((a) => a.id === id);
    if (!address) return;
    if (nameRef.current) nameRef.current.value = address.name;
    if (line1Ref.current) line1Ref.current.value = address.line1;
    if (line2Ref.current) line2Ref.current.value = address.line2 ?? '';
    if (cityRef.current) cityRef.current.value = address.city;
    if (regionRef.current) regionRef.current.value = address.region;
    if (postalCodeRef.current) postalCodeRef.current.value = address.postalCode;
    if (countryRef.current) countryRef.current.value = address.country;
  }

  return (
    <Card className={styles.card}>
      <form action={formAction}>
        <Field label="Email for order updates" htmlFor="customerEmail">
          <Input type="email" id="customerEmail" name="customerEmail" required />
        </Field>

        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Shipping address</legend>

          {savedAddresses.length > 0 && (
            <Field label="Use a saved address" htmlFor="savedAddressSelect">
              <Select
                id="savedAddressSelect"
                onChange={(e) => applySavedAddress(e.target.value)}
                defaultValue=""
              >
                <option value="">Enter a new address</option>
                {savedAddresses.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} — {a.line1}, {a.city}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <Field label="Full name" htmlFor="shippingName">
            <Input type="text" id="shippingName" name="shippingName" ref={nameRef} required />
          </Field>
          <Field label="Address line 1" htmlFor="shippingLine1">
            <Input type="text" id="shippingLine1" name="shippingLine1" ref={line1Ref} required />
          </Field>
          <Field label="Address line 2 (optional)" htmlFor="shippingLine2">
            <Input type="text" id="shippingLine2" name="shippingLine2" ref={line2Ref} />
          </Field>

          <div className={styles.row}>
            <Field label="City" htmlFor="shippingCity" className={styles.rowField}>
              <Input type="text" id="shippingCity" name="shippingCity" ref={cityRef} required />
            </Field>
            <Field label="State / region" htmlFor="shippingRegion" className={styles.rowField}>
              <Input type="text" id="shippingRegion" name="shippingRegion" ref={regionRef} required />
            </Field>
          </div>

          <div className={styles.row}>
            <Field
              label="Postal code"
              htmlFor="shippingPostalCode"
              className={styles.rowField}
            >
              <Input
                type="text"
                id="shippingPostalCode"
                name="shippingPostalCode"
                ref={postalCodeRef}
                required
              />
            </Field>
            <Field label="Country" htmlFor="shippingCountry" className={styles.rowField}>
              <Input type="text" id="shippingCountry" name="shippingCountry" ref={countryRef} required />
            </Field>
          </div>

          {isLoggedIn && (
            <label className={styles.checkboxLabel}>
              <input type="checkbox" name="saveAddress" />
              Save this address for next time
            </label>
          )}
        </fieldset>

        {state.error && <Alert>{state.error}</Alert>}

        <Button type="submit" disabled={isPending} className={styles.submit}>
          {isPending ? 'Starting checkout…' : 'Pay with Bitcoin'}
        </Button>
      </form>
    </Card>
  );
}
