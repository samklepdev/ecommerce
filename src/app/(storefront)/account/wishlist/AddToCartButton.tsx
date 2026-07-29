'use client';

import { useActionState } from 'react';

import { addToCartAction, type AddToCartActionResult } from '@/app/actions/cart';
import { Button } from '@/components/ui/Button';
import styles from './page.module.css';

const initialState: AddToCartActionResult = {};

/** Moves a saved product into the cart without leaving the list — the whole
 * point of having saved it. It stays saved: "I bought one" and "I'm no
 * longer interested" are different, and only the customer knows which. */
export function AddToCartButton({
  productId,
  productName,
}: {
  productId: string;
  productName: string;
}) {
  const [state, formAction, isPending] = useActionState(addToCartAction, initialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="quantity" value="1" />
      <Button type="submit" variant="secondary" disabled={isPending}>
        {isPending ? 'Adding…' : 'Add to cart'}
      </Button>
      {state.error && (
        <span className={styles.error} role="alert">
          {state.error}
        </span>
      )}
      <span className={styles.srOnly}>{productName}</span>
    </form>
  );
}
