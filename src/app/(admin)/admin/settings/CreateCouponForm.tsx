'use client';

import { useActionState, useState } from 'react';

import { createCouponAction, type CreateCouponActionResult } from '@/app/actions/admin/coupons';
import { Field } from '@/components/ui/Field';
import { Input, Select } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import styles from './page.module.css';

const initialState: CreateCouponActionResult = {};

function useResultNonce(result: unknown): number {
  const [[prev, nonce], setState] = useState<[unknown, number]>([result, 0]);
  if (prev !== result) {
    setState([result, nonce + 1]);
  }
  return nonce;
}

export function CreateCouponForm() {
  const [state, formAction, isPending] = useActionState(createCouponAction, initialState);
  const nonce = useResultNonce(state);
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed_amount'>('percentage');

  return (
    <form action={formAction} className={styles.createForm}>
      <Field label="Code" htmlFor="coupon-code">
        <Input type="text" id="coupon-code" name="code" required />
      </Field>
      <Field label="Discount type" htmlFor="coupon-type">
        <Select
          id="coupon-type"
          name="discountType"
          value={discountType}
          onChange={(e) => setDiscountType(e.target.value as 'percentage' | 'fixed_amount')}
        >
          <option value="percentage">Percentage</option>
          <option value="fixed_amount">Fixed amount</option>
        </Select>
      </Field>
      {discountType === 'percentage' ? (
        <Field label="Percentage off" htmlFor="coupon-percentage">
          <Input type="number" id="coupon-percentage" name="percentageValue" min={1} max={100} required />
        </Field>
      ) : (
        <Field label="Amount off (USD)" htmlFor="coupon-fixed">
          <Input type="number" id="coupon-fixed" name="fixedAmountDisplay" min={0.01} step={0.01} required />
        </Field>
      )}

      {/* Both optional, and both blank by default so nothing about existing
          behaviour changes by accident — a code with neither set is exactly
          what every coupon was before these existed. */}
      <Field label="Expires on (optional)" htmlFor="coupon-expires">
        <Input type="date" id="coupon-expires" name="expiresOn" />
      </Field>
      <Field label="Max redemptions (optional)" htmlFor="coupon-max">
        <Input type="number" id="coupon-max" name="maxRedemptions" min={1} step={1} />
      </Field>
      {/* Keyed on the customer's email — the only identity a guest checkout
          has. Not a strong control (a determined person can use another
          address); it stops casual reuse, and the global cap above is still
          the hard ceiling. */}
      <Field label="Max per customer (optional)" htmlFor="coupon-per-customer">
        <Input type="number" id="coupon-per-customer" name="maxPerCustomer" min={1} step={1} />
      </Field>

      <Button type="submit" disabled={isPending}>
        {isPending ? 'Creating…' : 'Create coupon'}
      </Button>

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
    </form>
  );
}
