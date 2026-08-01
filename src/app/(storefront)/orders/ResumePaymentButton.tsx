'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { resumePaymentAction, type ResumePaymentActionResult } from '@/app/actions/orders';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';

const initialState: ResumePaymentActionResult = {};

/**
 * Offered on an order that is still payable but has no payment address.
 *
 * That state is reachable whenever `StartCheckout` failed after `PlaceOrder`
 * had already claimed the cart — the rate feed down, Redis unavailable. The
 * customer's cart is gone and the order can't be paid, so without this there
 * is no way forward for them at all.
 *
 * Refreshes on success so the address, QR and countdown all arrive from one
 * render rather than appearing piecemeal.
 */
export function ResumePaymentButton({ orderId }: { orderId: string }) {
  const [state, formAction, isPending] = useActionState(resumePaymentAction, initialState);
  const router = useRouter();

  useEffect(() => {
    if (state.message) router.refresh();
  }, [state.message, router]);

  return (
    <form action={formAction}>
      <input type="hidden" name="orderId" value={orderId} />
      <Button type="submit" disabled={isPending}>
        {isPending ? 'Setting up payment…' : 'Set up payment'}
      </Button>
      {state.error && <Alert tone="danger">{state.error}</Alert>}
    </form>
  );
}
