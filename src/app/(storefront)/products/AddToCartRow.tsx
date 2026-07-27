'use client';

import { useActionState, useState } from 'react';

import { addToCartAction, type AddToCartActionResult } from '@/app/actions/cart';
import { useAddToCartFeedback } from '@/app/lib/use-add-to-cart-feedback';
import { MAX_CART_LINE_QUANTITY } from '@/modules/cart/domain/cart-line';
import { QuantityStepper } from '@/components/ui/QuantityStepper';
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

      <QuantityStepper
        value={quantity}
        onChange={setQuantity}
        max={MAX_CART_LINE_QUANTITY}
        disabled={disabled}
      />

      {/* No price here: the card above shows it in both fiat and sats, and
          repeating it in the action row made the tile read as two prices. */}
      <button type="submit" className={styles.addButton} disabled={disabled || isPending}>
        {disabled ? 'Unavailable' : isPending ? 'Adding…' : 'Add to cart'}
      </button>
    </form>
  );
}
