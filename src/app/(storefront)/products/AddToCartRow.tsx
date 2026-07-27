'use client';

import { useActionState, useState } from 'react';

import { addToCartAction, type AddToCartActionResult } from '@/app/actions/cart';
import { useAddToCartFeedback } from '@/app/lib/use-add-to-cart-feedback';
import { MAX_CART_LINE_QUANTITY } from '@/modules/cart/domain/cart-line';
import styles from './AddToCartRow.module.css';

interface AddToCartRowProps {
  variantId: string;
  disabled?: boolean;
}

const initialState: AddToCartActionResult = {};

export function AddToCartRow({ variantId, disabled = false }: AddToCartRowProps) {
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
          onClick={() => setQuantity((q) => Math.min(MAX_CART_LINE_QUANTITY, q + 1))}
          disabled={disabled || quantity >= MAX_CART_LINE_QUANTITY}
          aria-label="Increase quantity"
        >
          +
        </button>
      </div>

      {/* No price here: the card above shows it in both fiat and sats, and
          repeating it in the action row made the tile read as two prices. */}
      <button type="submit" className={styles.addButton} disabled={disabled || isPending}>
        {disabled ? 'Unavailable' : isPending ? 'Adding…' : 'Add to cart'}
      </button>
    </form>
  );
}
