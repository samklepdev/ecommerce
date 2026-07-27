'use client';

import { useActionState, useState } from 'react';

import { addToCartAction, type AddToCartActionResult } from '@/app/actions/cart';
import { useAddToCartFeedback } from '@/app/lib/use-add-to-cart-feedback';
import { MAX_CART_LINE_QUANTITY } from '@/modules/cart/domain/cart-line';
import { Amount } from '@/components/ui/Amount';
import { QuantityStepper } from '@/components/ui/QuantityStepper';
import styles from './BuyBox.module.css';

export interface BuyBoxProps {
  productId: string;
  priceDisplay: string;
  /** Pre-formatted on the server; null when the rate feed was unreachable. */
  satsDisplay: string | null;
  /** Minor units, for the running total on the button. */
  priceMinor: number;
  currency: string;
  isAvailable: boolean;
  /** "1 BTC = $95,000" — omitted when the rate feed was unreachable. */
  btcRateLabel: string | null;
}

const initialState: AddToCartActionResult = {};

function formatTotal(minor: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(minor / 100);
}

/**
 * Price and the add-to-cart control as one unit.
 *
 * There used to be a configuration chooser here, back when a product could
 * have several variants. The product is the sellable unit now, so there's
 * exactly one price and one button — which was already the only case this
 * page ever rendered in practice.
 */
export function BuyBox({
  productId,
  priceDisplay,
  satsDisplay,
  priceMinor,
  currency,
  isAvailable,
  btcRateLabel,
}: BuyBoxProps) {
  const [quantity, setQuantity] = useState(1);
  const [state, formAction, isPending] = useActionState(addToCartAction, initialState);
  useAddToCartFeedback(state);

  const total = formatTotal(priceMinor * quantity, currency);

  return (
    <div className={styles.buyBox}>
      <div className={styles.priceBlock}>
        <Amount fiat={priceDisplay} sats={satsDisplay} size="lg" />
        <span className={styles.rate}>
          {btcRateLabel ? `${btcRateLabel} · ` : ''}rate locked at checkout
        </span>
      </div>

      <form action={formAction} className={styles.addRow}>
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="quantity" value={quantity} />

        <QuantityStepper
          value={quantity}
          onChange={setQuantity}
          max={MAX_CART_LINE_QUANTITY}
          disabled={!isAvailable}
        />

        <button type="submit" className={styles.addButton} disabled={!isAvailable || isPending}>
          {!isAvailable ? 'Out of stock' : isPending ? 'Adding…' : `Add to cart · ${total}`}
        </button>
      </form>
    </div>
  );
}
