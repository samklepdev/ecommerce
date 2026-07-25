'use client';

import { useTransition } from 'react';

import { updateCartLineQuantityAction } from '@/app/actions/cart';
import { MAX_CART_LINE_QUANTITY } from '@/modules/cart/domain/cart-line';
import styles from './CartLineQuantityStepper.module.css';

interface CartLineQuantityStepperProps {
  variantId: string;
  quantity: number;
}

/** Each +/- click persists immediately (no separate "Save" step) — calls the
 * server action directly rather than via a form submit, since the stepper
 * needs to fire on click, not on a form's submit event. `revalidatePath`
 * inside the action refreshes the server-rendered cart totals once the
 * transition settles. */
export function CartLineQuantityStepper({ variantId, quantity }: CartLineQuantityStepperProps) {
  const [isPending, startTransition] = useTransition();

  function updateTo(nextQuantity: number) {
    if (nextQuantity < 1) return;
    const formData = new FormData();
    formData.set('variantId', variantId);
    formData.set('quantity', String(nextQuantity));
    startTransition(() => {
      updateCartLineQuantityAction(formData);
    });
  }

  return (
    <div className={styles.stepper}>
      <button
        type="button"
        className={styles.stepButton}
        onClick={() => updateTo(quantity - 1)}
        disabled={isPending || quantity <= 1}
        aria-label="Decrease quantity"
      >
        −
      </button>
      <span className={styles.quantity}>{quantity}</span>
      <button
        type="button"
        className={styles.stepButton}
        onClick={() => updateTo(quantity + 1)}
        disabled={isPending || quantity >= MAX_CART_LINE_QUANTITY}
        aria-label="Increase quantity"
      >
        +
      </button>
    </div>
  );
}
