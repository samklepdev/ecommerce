'use client';

import { useState } from 'react';

import { US_STATES, COMMON_COUNTRIES } from '@/shared/domain/address-options';
import { Field } from '@/components/ui/Field';
import { Input, Select } from '@/components/ui/Input';

export interface AddressFormFieldsInitialValues {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
}

export interface AddressFormFieldsProps {
  /** Distinguishes field ids across multiple forms on the same page (e.g.
   * one per saved-address card being edited at once). */
  idPrefix: string;
  initial?: AddressFormFieldsInitialValues;
}

/** The shared name/line1/line2/city/region/postalCode/country fields, plus
 * the country-drives-region-field-type toggle, used by both
 * `AddSavedAddressForm` and `EditSavedAddressForm` (and mirrored in
 * `CheckoutForm`). Fully self-contained — the enclosing `<form>` just needs
 * a matching `action`. */
export function AddressFormFields({ idPrefix, initial }: AddressFormFieldsProps) {
  const [country, setCountry] = useState(initial?.country ?? 'US');
  const [region, setRegion] = useState(initial?.region ?? '');

  return (
    <>
      <Field label="Name" htmlFor={`${idPrefix}-name`}>
        <Input type="text" id={`${idPrefix}-name`} name="name" defaultValue={initial?.name} required />
      </Field>
      <Field label="Address line 1" htmlFor={`${idPrefix}-line1`}>
        <Input type="text" id={`${idPrefix}-line1`} name="line1" defaultValue={initial?.line1} required />
      </Field>
      <Field label="Address line 2" htmlFor={`${idPrefix}-line2`} hint="Optional">
        <Input type="text" id={`${idPrefix}-line2`} name="line2" defaultValue={initial?.line2} />
      </Field>
      <Field label="City" htmlFor={`${idPrefix}-city`}>
        <Input type="text" id={`${idPrefix}-city`} name="city" defaultValue={initial?.city} required />
      </Field>
      <Field label="State / region" htmlFor={`${idPrefix}-region`}>
        {country === 'US' ? (
          <Select
            id={`${idPrefix}-region`}
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
            id={`${idPrefix}-region`}
            name="region"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
          />
        )}
      </Field>
      <Field label="Postal code" htmlFor={`${idPrefix}-postal`}>
        <Input
          type="text"
          id={`${idPrefix}-postal`}
          name="postalCode"
          defaultValue={initial?.postalCode}
          required
        />
      </Field>
      <Field label="Country" htmlFor={`${idPrefix}-country`}>
        <Select
          id={`${idPrefix}-country`}
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
    </>
  );
}
