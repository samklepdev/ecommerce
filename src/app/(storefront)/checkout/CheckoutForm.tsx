'use client';

import { useActionState, useRef, useState } from 'react';
import Link from 'next/link';

import { startCheckoutAction, type StartCheckoutActionResult } from '@/app/actions/checkout';
import { US_STATES, COMMON_COUNTRIES } from '@/shared/domain/address-options';
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
  userEmail?: string;
}

export function CheckoutForm({ isLoggedIn, savedAddresses, userEmail }: CheckoutFormProps) {
  const [state, formAction, isPending] = useActionState(startCheckoutAction, initialState);

  const nameRef = useRef<HTMLInputElement>(null);
  const line1Ref = useRef<HTMLInputElement>(null);
  const line2Ref = useRef<HTMLInputElement>(null);
  const cityRef = useRef<HTMLInputElement>(null);
  const postalCodeRef = useRef<HTMLInputElement>(null);

  // Country drives whether the State/region field is a dropdown (US) or a
  // free-text input (everywhere else, since "state" isn't a US-only concept
  // but this store only curates a US states list) — both need to be
  // controlled state rather than refs so switching country can re-render
  // the region field's input type.
  const [country, setCountry] = useState('US');
  const [region, setRegion] = useState('');

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
    if (postalCodeRef.current) postalCodeRef.current.value = address.postalCode;
    setCountry(address.country);
    setRegion(address.region);
  }

  return (
    <Card className={styles.card}>
      <form action={formAction}>
        {/* A signed-in customer doesn't retype an address the account
            already holds — the field only exists for guests, who have
            nowhere else to put one. The value still travels with the form
            either way, because the order needs an email to confirm to. */}
        {isLoggedIn && userEmail ? (
          <>
            <input type="hidden" name="customerEmail" value={userEmail} />
            <p className={styles.emailNote}>
              Confirmation goes to <strong>{userEmail}</strong> ·{' '}
              <Link href="/account">change in your account</Link>
            </p>
          </>
        ) : (
          <Field label="Email" htmlFor="customerEmail" hint="Where your confirmation and order link go">
            <Input
              type="email"
              id="customerEmail"
              name="customerEmail"
              defaultValue={userEmail}
              required
            />
          </Field>
        )}

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
              {country === 'US' ? (
                <Select
                  id="shippingRegion"
                  name="shippingRegion"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  required
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
                  id="shippingRegion"
                  name="shippingRegion"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  required
                />
              )}
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
              <Select
                id="shippingCountry"
                name="shippingCountry"
                value={country}
                onChange={(e) => {
                  setCountry(e.target.value);
                  // A state code from one country is meaningless for
                  // another — clear it rather than leaving a stale value
                  // silently submitted under the new country.
                  setRegion('');
                }}
                required
              >
                {COMMON_COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {isLoggedIn && (
            <label className={styles.checkboxLabel}>
              <input type="checkbox" name="saveAddress" />
              Save this address for next time
            </label>
          )}
        </fieldset>

        <Field label="Promo code" htmlFor="couponCode" hint="Optional">
          <Input type="text" id="couponCode" name="couponCode" />
        </Field>

        {state.error && <Alert>{state.error}</Alert>}

        <Button type="submit" disabled={isPending} className={styles.submit}>
          {isPending ? 'Starting checkout…' : 'Pay with Bitcoin'}
        </Button>
      </form>
    </Card>
  );
}
