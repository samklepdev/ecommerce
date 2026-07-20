'use client';

import { useActionState, useState } from 'react';

import { addToCartAction, type AddToCartActionResult } from '@/app/actions/cart';
import { useAddToCartFeedback } from '@/app/lib/use-add-to-cart-feedback';
import { Button } from '@/components/ui/Button';
import styles from './AddToCartRow.module.css';

interface AddToCartRowProps {
  variantId: string;
  priceDisplay: string;
  disabled?: boolean;
}

const initialState: AddToCartActionResult = {};

export function AddToCartRow({ variantId, priceDisplay, disabled = false }: AddToCartRowProps) {
  const [quantity, setQuantity] = useState(1);
  const [state, formAction, isPending] = useActionState(addToCartAction, initialState);
  useAddToCartFeedback(state);

  return (
    <form action={formAction} className={styles.row}>
      <input type="hidden" name="variantId" value={variantId} />
      <input type="hidden" name="quantity" value={quantity} />

      <div className={styles.stepper}>
        <button
          type="button"
          className={styles.stepButton}
          onClick={() => setQuantity((q) => Math.max(1, q - 1))}
          disabled={disabled}
          aria-label="Decrease quantity"
        >
          −
        </button>
        <span className={styles.quantity}>{quantity}</span>
        <button
          type="button"
          className={styles.stepButton}
          onClick={() => setQuantity((q) => q + 1)}
          disabled={disabled}
          aria-label="Increase quantity"
        >
          +
        </button>
      </div>

      <span className={styles.price}>{priceDisplay}</span>

      <Button type="submit" disabled={disabled || isPending} className={styles.addButton}>
        {disabled ? 'Out of stock' : 'Add to cart'}
      </Button>
    </form>
  );
}
