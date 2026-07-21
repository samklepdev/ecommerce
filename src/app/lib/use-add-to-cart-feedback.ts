'use client';

import { useEffect, useRef } from 'react';

import { useToast } from '@/components/ui/ToastProvider';
import type { AddToCartActionResult } from '@/app/actions/cart';

/** Fires a toast whenever a new `AddToCartActionResult` comes back from
 * `useActionState` — an external side effect (dispatching to the toast
 * queue), so `useEffect` is the right tool here, unlike the render-time
 * state-adjustment pattern used for local re-keying elsewhere. */
export function useAddToCartFeedback(state: AddToCartActionResult): void {
  const toast = useToast();
  const seen = useRef(state);

  useEffect(() => {
    if (seen.current === state) return;
    seen.current = state;
    if (state.message) toast.success(state.message);
    if (state.error) toast.error(state.error);
  }, [state, toast]);
}
