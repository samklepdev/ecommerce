'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { refreshPaymentQuoteAction, type RefreshQuoteActionResult } from '@/app/actions/orders';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';

const initialState: RefreshQuoteActionResult = {};

/** Refreshes the page on success so the new amount, QR and countdown all
 * come from one render — updating some of them in place and leaving the QR
 * stale is the failure mode worth avoiding here. */
export function RefreshQuoteButton({ orderId }: { orderId: string }) {
  const [state, formAction, isPending] = useActionState(refreshPaymentQuoteAction, initialState);
  const router = useRouter();

  useEffect(() => {
    if (state.message) router.refresh();
  }, [state.message, router]);

  return (
    <form action={formAction}>
      <input type="hidden" name="orderId" value={orderId} />
      <Button type="submit" disabled={isPending}>
        {isPending ? 'Getting a new price…' : "Get today's price"}
      </Button>
      {state.error && <Alert tone="danger">{state.error}</Alert>}
    </form>
  );
}
