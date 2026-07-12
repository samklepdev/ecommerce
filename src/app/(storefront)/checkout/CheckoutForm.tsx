'use client';

import { useActionState } from 'react';

import { startCheckoutAction, type StartCheckoutActionResult } from '@/app/actions/checkout';
import { BitcoinCheckout } from './BitcoinCheckout';

const initialState: StartCheckoutActionResult = {};

export function CheckoutForm() {
  const [state, formAction, isPending] = useActionState(startCheckoutAction, initialState);

  if (state.orderId && state.reference && state.bip21Uri) {
    return (
      <BitcoinCheckout
        orderId={state.orderId}
        address={state.reference}
        bip21Uri={state.bip21Uri}
        expiresAt={state.expiresAt ?? null}
      />
    );
  }

  return (
    <form action={formAction}>
      <label>
        Email for order updates
        <input type="email" name="customerEmail" required />
      </label>

      <fieldset>
        <legend>Shipping address</legend>
        <label>
          Full name
          <input type="text" name="shippingName" required />
        </label>
        <label>
          Address line 1
          <input type="text" name="shippingLine1" required />
        </label>
        <label>
          Address line 2 (optional)
          <input type="text" name="shippingLine2" />
        </label>
        <label>
          City
          <input type="text" name="shippingCity" required />
        </label>
        <label>
          State / region
          <input type="text" name="shippingRegion" required />
        </label>
        <label>
          Postal code
          <input type="text" name="shippingPostalCode" required />
        </label>
        <label>
          Country
          <input type="text" name="shippingCountry" required />
        </label>
      </fieldset>

      <button type="submit" disabled={isPending}>
        {isPending ? 'Starting checkout…' : 'Pay with Bitcoin'}
      </button>
      {state.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
