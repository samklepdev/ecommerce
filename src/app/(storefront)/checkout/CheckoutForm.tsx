'use client';

import { useActionState } from 'react';

import { startCheckoutAction, type StartCheckoutActionResult } from '@/app/actions/checkout';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import styles from './CheckoutForm.module.css';

const initialState: StartCheckoutActionResult = {};

export function CheckoutForm() {
  const [state, formAction, isPending] = useActionState(startCheckoutAction, initialState);

  return (
    <Card className={styles.card}>
      <form action={formAction}>
        <Field label="Email for order updates" htmlFor="customerEmail">
          <Input type="email" id="customerEmail" name="customerEmail" required />
        </Field>

        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Shipping address</legend>

          <Field label="Full name" htmlFor="shippingName">
            <Input type="text" id="shippingName" name="shippingName" required />
          </Field>
          <Field label="Address line 1" htmlFor="shippingLine1">
            <Input type="text" id="shippingLine1" name="shippingLine1" required />
          </Field>
          <Field label="Address line 2 (optional)" htmlFor="shippingLine2">
            <Input type="text" id="shippingLine2" name="shippingLine2" />
          </Field>

          <div className={styles.row}>
            <Field label="City" htmlFor="shippingCity" className={styles.rowField}>
              <Input type="text" id="shippingCity" name="shippingCity" required />
            </Field>
            <Field label="State / region" htmlFor="shippingRegion" className={styles.rowField}>
              <Input type="text" id="shippingRegion" name="shippingRegion" required />
            </Field>
          </div>

          <div className={styles.row}>
            <Field
              label="Postal code"
              htmlFor="shippingPostalCode"
              className={styles.rowField}
            >
              <Input type="text" id="shippingPostalCode" name="shippingPostalCode" required />
            </Field>
            <Field label="Country" htmlFor="shippingCountry" className={styles.rowField}>
              <Input type="text" id="shippingCountry" name="shippingCountry" required />
            </Field>
          </div>
        </fieldset>

        {state.error && <Alert>{state.error}</Alert>}

        <Button type="submit" disabled={isPending} className={styles.submit}>
          {isPending ? 'Starting checkout…' : 'Pay with Bitcoin'}
        </Button>
      </form>
    </Card>
  );
}
