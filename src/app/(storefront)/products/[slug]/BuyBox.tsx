'use client';

import { useActionState, useMemo, useState } from 'react';

import { addToCartAction, type AddToCartActionResult } from '@/app/actions/cart';
import { useAddToCartFeedback } from '@/app/lib/use-add-to-cart-feedback';
import { MAX_CART_LINE_QUANTITY } from '@/modules/cart/domain/cart-line';
import { cx } from '@/components/ui/cx';
import { QuantityStepper } from '@/components/ui/QuantityStepper';
import styles from './BuyBox.module.css';

export interface BuyBoxVariant {
  id: string;
  name: string;
  /** Shown under the name — the SKU is the only per-variant detail the
   * catalog actually carries. */
  sku: string;
  priceDisplay: string;
  /** Pre-formatted on the server; null when the rate feed was unreachable. */
  satsDisplay: string | null;
  /** Minor units, for the running total on the button. */
  priceMinor: number;
  currency: string;
  isAvailable: boolean;
}

export interface BuyBoxProps {
  variants: BuyBoxVariant[];
  /** "1 BTC = $95,000" — omitted when the rate feed was unreachable. */
  btcRateLabel: string | null;
}

const initialState: AddToCartActionResult = {};

function formatTotal(minor: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(minor / 100);
}

/**
 * Price, configuration and the add-to-cart control as one unit.
 *
 * Replaces the previous row-per-variant layout: with a card and a button per
 * variant, a three-variant product showed three prices and three buttons and
 * never said which one you were buying. Here the selection drives one price
 * and one button, so there's a single answer to "what am I adding".
 */
export function BuyBox({ variants, btcRateLabel }: BuyBoxProps) {
  const firstAvailable = variants.find((v) => v.isAvailable) ?? variants[0];
  const [selectedId, setSelectedId] = useState(firstAvailable?.id ?? '');
  const [quantity, setQuantity] = useState(1);
  const [state, formAction, isPending] = useActionState(addToCartAction, initialState);
  useAddToCartFeedback(state);

  const selected = useMemo(
    () => variants.find((v) => v.id === selectedId) ?? firstAvailable,
    [variants, selectedId, firstAvailable],
  );

  if (!selected) return null;

  const available = selected.isAvailable;
  const total = formatTotal(selected.priceMinor * quantity, selected.currency);

  return (
    <div className={styles.buyBox}>
      <div className={styles.priceBlock}>
        <span className={styles.fiat}>{selected.priceDisplay}</span>
        {selected.satsDisplay && <span className={styles.sats}>{selected.satsDisplay}</span>}
        <span className={styles.rate}>
          {btcRateLabel ? `${btcRateLabel} · ` : ''}rate locked at checkout
        </span>
      </div>

      {/* A single variant needs no chooser — the price block above already
          says everything the radio would. */}
      {variants.length > 1 && (
        <fieldset className={styles.variants}>
          <legend className={styles.legend}>Configuration</legend>
          {variants.map((variant) => (
            <label
              key={variant.id}
              className={cx(
                styles.variant,
                variant.id === selected.id && styles.variantOn,
                !variant.isAvailable && styles.variantOff,
              )}
            >
              <input
                type="radio"
                name="variant"
                value={variant.id}
                checked={variant.id === selected.id}
                disabled={!variant.isAvailable}
                onChange={() => {
                  setSelectedId(variant.id);
                  // Quantity is a property of the line you're about to add,
                  // not of the product — carrying 7 across a switch would be
                  // a surprise at checkout.
                  setQuantity(1);
                }}
              />
              <span className={styles.variantMain}>
                <span className={styles.variantName}>{variant.name}</span>
                <span className={styles.variantSku}>{variant.sku}</span>
              </span>
              <span className={styles.variantRight}>
                <span className={styles.variantPrice}>{variant.priceDisplay}</span>
                {!variant.isAvailable && <span className={styles.badge}>Out of stock</span>}
              </span>
            </label>
          ))}
        </fieldset>
      )}

      <form action={formAction} className={styles.addRow}>
        <input type="hidden" name="variantId" value={selected.id} />
        <input type="hidden" name="quantity" value={quantity} />

        <QuantityStepper
          value={quantity}
          onChange={setQuantity}
          max={MAX_CART_LINE_QUANTITY}
          disabled={!available}
        />

        <button type="submit" className={styles.addButton} disabled={!available || isPending}>
          {!available ? 'Out of stock' : isPending ? 'Adding…' : `Add to cart · ${total}`}
        </button>
      </form>
    </div>
  );
}
