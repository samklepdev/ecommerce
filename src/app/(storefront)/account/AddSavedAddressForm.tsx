'use client';

import { useActionState, useState } from 'react';

import { addSavedAddressAction, type AddSavedAddressActionResult } from '@/app/actions/addresses';
import { US_STATES, COMMON_COUNTRIES } from '@/shared/domain/address-options';
import { Field } from '@/components/ui/Field';
import { Input, Select } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import styles from './page.module.css';

const initialState: AddSavedAddressActionResult = {};

function useResultNonce(result: unknown): number {
  const [[prev, nonce], setState] = useState<[unknown, number]>([result, 0]);
  if (prev !== result) {
    setState([result, nonce + 1]);
  }
  return nonce;
}

export function AddSavedAddressForm() {
  const [state, formAction, isPending] = useActionState(addSavedAddressAction, initialState);
  const nonce = useResultNonce(state);

  // Same country-drives-region-field-type approach as CheckoutForm.
  const [country, setCountry] = useState('US');
  const [region, setRegion] = useState('');

  return (
    <form action={formAction} className={styles.form}>
      <Field label="Name" htmlFor="addr-name">
        <Input type="text" id="addr-name" name="name" required />
      </Field>
      <Field label="Address line 1" htmlFor="addr-line1">
        <Input type="text" id="addr-line1" name="line1" required />
      </Field>
      <Field label="Address line 2" htmlFor="addr-line2" hint="Optional">
        <Input type="text" id="addr-line2" name="line2" />
      </Field>
      <Field label="City" htmlFor="addr-city">
        <Input type="text" id="addr-city" name="city" required />
      </Field>
      <Field label="State / region" htmlFor="addr-region">
        {country === 'US' ? (
          <Select
            id="addr-region"
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
            id="addr-region"
            name="region"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
          />
        )}
      </Field>
      <Field label="Postal code" htmlFor="addr-postal">
        <Input type="text" id="addr-postal" name="postalCode" required />
      </Field>
      <Field label="Country" htmlFor="addr-country">
        <Select
          id="addr-country"
          name="country"
          value={country}
          onChange={(e) => {
            setCountry(e.target.value);
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

      {state.error && (
        <Alert key={nonce} tone="danger" className={styles.fadeAlert}>
          {state.error}
        </Alert>
      )}
      {state.message && (
        <Alert key={nonce} tone="success" className={styles.fadeAlert}>
          {state.message}
        </Alert>
      )}

      <Button type="submit" disabled={isPending}>
        {isPending ? 'Saving…' : 'Add address'}
      </Button>
    </form>
  );
}
