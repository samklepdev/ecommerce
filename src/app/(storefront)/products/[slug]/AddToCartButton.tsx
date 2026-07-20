'use client';

import { useActionState } from 'react';

import { addToCartAction, type AddToCartActionResult } from '@/app/actions/cart';
import { useAddToCartFeedback } from '@/app/lib/use-add-to-cart-feedback';
import { Button } from '@/components/ui/Button';

interface AddToCartButtonProps {
  variantId: string;
  isAvailable: boolean;
}

const initialState: AddToCartActionResult = {};

export function AddToCartButton({ variantId, isAvailable }: AddToCartButtonProps) {
  const [state, formAction, isPending] = useActionState(addToCartAction, initialState);
  useAddToCartFeedback(state);

  return (
    <form action={formAction}>
      <input type="hidden" name="variantId" value={variantId} />
      <input type="hidden" name="quantity" value="1" />
      <Button type="submit" disabled={!isAvailable || isPending}>
        {isAvailable ? 'Add to cart' : 'Out of stock'}
      </Button>
    </form>
  );
}
