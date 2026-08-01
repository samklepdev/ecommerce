'use client';

import { useActionState } from 'react';

import {
  creditLatePaymentAction,
  type CreditLatePaymentActionResult,
} from '@/app/actions/admin/orders';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';

const initialState: CreditLatePaymentActionResult = {};

interface CreditLatePaymentButtonProps {
  orderId: string;
  /** Rendered so the decision is made with the figure in view, not from a
   * button label alone. */
  amountBtc: string;
}

/**
 * Credits bitcoin that arrived against an order the shop had already closed.
 *
 * Only rendered when `SweepLatePayments` has actually seen money at the
 * address. Sudo-gated server-side; this is the affordance, not the guard.
 */
export function CreditLatePaymentButton({ orderId, amountBtc }: CreditLatePaymentButtonProps) {
  const [state, formAction, isPending] = useActionState(creditLatePaymentAction, initialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="orderId" value={orderId} />
      <Button type="submit" disabled={isPending}>
        {isPending ? 'Crediting…' : `Credit ${amountBtc} BTC and mark paid`}
      </Button>
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.message && <Alert tone="success">{state.message}</Alert>}
    </form>
  );
}
