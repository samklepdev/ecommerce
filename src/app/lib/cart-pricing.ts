import type { Money } from '@/shared/domain/money';
import { Money as MoneyVO } from '@/shared/domain/money';

/** The shape both pages already have: a cart line's stored snapshot. */
export interface PricedCartLine {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: Money;
}

/** The live catalogue entry, as already loaded by `getProductsByIds`. */
export interface LiveProduct {
  id: string;
  name: string;
  price: Money;
}

export interface RepricedLine {
  productId: string;
  /** Live name where the product still exists, else the line's snapshot. */
  name: string;
  quantity: number;
  /** What this line costs **now** — the figure the customer will be charged. */
  unitPrice: Money;
  lineTotal: Money;
  /** The stored price, when it differs from `unitPrice`. Null when unchanged. */
  previousUnitPrice: Money | null;
  /** The product has left the catalogue; `PlaceOrder` will refuse this order. */
  unavailable: boolean;
}

export interface RepricedCart {
  lines: RepricedLine[];
  subtotal: Money;
  /** True when any line's price moved since it was added. */
  hasPriceChanges: boolean;
  /** True when any line's product has gone. */
  hasUnavailable: boolean;
}

/**
 * Reprices a cart against the live catalogue, for **display**.
 *
 * This exists because the cart and checkout pages rendered `line.unitPrice` —
 * the price captured at add-to-cart — while `PlaceOrder` re-reads the catalogue
 * and charges the current one. A price change between the two meant the
 * customer was shown one amount, authorised it, and had a BIP21 URI generated
 * for another. Irreversibly, in Bitcoin, with no refund mechanism.
 *
 * `PlaceOrder` remains the pricing authority; nothing here decides what is
 * charged. The point is that what the customer *sees* now comes from the same
 * source as what they will *pay*, and that a change is called out rather than
 * applied silently.
 *
 * Pure, and takes the products the page has already fetched, so it adds no
 * queries and can be tested without a database.
 *
 * A line whose product has gone keeps its snapshot price for display and is
 * flagged `unavailable` — showing a blank row would be worse, and `PlaceOrder`
 * refuses the order with `product_unavailable` anyway.
 */
export function repriceCartForDisplay(
  lines: readonly PricedCartLine[],
  products: ReadonlyMap<string, LiveProduct>,
  currency: string,
  /**
   * Products that exist and are priced correctly but cannot actually be
   * bought — their supplier offer is missing or unavailable.
   *
   * `PlaceOrder` refuses these outright, but the catalogue lookup can't
   * express it (the product is fine), so the page supplies it. Optional, and
   * empty by default, so a caller that hasn't got the answer keeps the old
   * behaviour rather than silently claiming everything is fine.
   */
  unsellableProductIds: ReadonlySet<string> = new Set(),
): RepricedCart {
  let subtotal = MoneyVO.zero(currency);
  let hasPriceChanges = false;
  let hasUnavailable = false;

  const repriced = lines.map((line) => {
    const found = products.get(line.productId);
    /**
     * A product priced in another currency counts as unavailable.
     *
     * A product's currency is admin-entered free text, so a cart can hold a
     * line this cart's currency cannot add to. Repricing against it threw
     * `Currency mismatch` out of a server component, 500-ing `/cart` and
     * `/checkout` for that visitor on every visit — and the page that would
     * let them remove the item was the page that crashed, so the only way out
     * was clearing the session cookie.
     *
     * Folded into the existing unavailable state rather than given its own:
     * both pages already render it, and `PlaceOrder` refuses both for the same
     * reason — the line cannot be bought as it stands.
     */
    const usable = found !== undefined && found.price.currency === currency;
    const product = usable ? found : undefined;

    const unitPrice = product?.price ?? line.unitPrice;
    const changed = product !== undefined && !product.price.equals(line.unitPrice);
    const lineTotal = unitPrice.multiply(line.quantity);

    // Unbuyable, not unpriced: the line still costs what it costs, and the
    // subtotal still includes it — the customer is being told to remove it,
    // not shown a blank row.
    const unavailable = product === undefined || unsellableProductIds.has(line.productId);

    if (changed) hasPriceChanges = true;
    if (unavailable) hasUnavailable = true;
    subtotal = subtotal.add(lineTotal);

    return {
      productId: line.productId,
      // The live name is still worth showing even when the price isn't usable
      // — it is what the customer is being asked to remove.
      name: found?.name ?? line.productName,
      quantity: line.quantity,
      unitPrice,
      lineTotal,
      previousUnitPrice: changed ? line.unitPrice : null,
      unavailable,
    };
  });

  return { lines: repriced, subtotal, hasPriceChanges, hasUnavailable };
}
