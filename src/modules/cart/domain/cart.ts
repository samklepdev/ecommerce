import { AggregateRoot } from '@/shared/domain/entity';
import { Money } from '@/shared/domain/money';
import { CartLine } from './cart-line';

export type CartOwner = { type: 'guest'; sessionId: string } | { type: 'user'; userId: string };

export interface CartProps {
  id: string;
  owner: CartOwner;
  lines: CartLine[];
}

export class Cart extends AggregateRoot<string> {
  readonly owner: CartOwner;
  private readonly _lines: CartLine[];

  private constructor(props: CartProps) {
    super(props.id);
    this.owner = props.owner;
    this._lines = props.lines;
  }

  static create(props: CartProps): Cart {
    return new Cart(props);
  }

  get lines(): readonly CartLine[] {
    return this._lines;
  }

  get isEmpty(): boolean {
    return this._lines.length === 0;
  }

  addLine(line: CartLine): Cart {
    const existingIndex = this._lines.findIndex((l) => l.variantId === line.variantId);
    const lines =
      existingIndex >= 0
        ? this._lines.map((l, i) =>
            i === existingIndex ? l.withQuantity(l.quantity + line.quantity) : l,
          )
        : [...this._lines, line];
    return Cart.create({ id: this.id, owner: this.owner, lines });
  }

  /** Sets a line's quantity directly (not additive, unlike `addLine`) — zero
   * or negative removes the line, matching `CartLine.create`'s own guard
   * against non-positive quantities. A no-op if the variant isn't in the
   * cart. */
  setLineQuantity(variantId: string, quantity: number): Cart {
    if (quantity <= 0) return this.removeLine(variantId);
    const existingIndex = this._lines.findIndex((l) => l.variantId === variantId);
    if (existingIndex < 0) return this;
    const lines = this._lines.map((l, i) => (i === existingIndex ? l.withQuantity(quantity) : l));
    return Cart.create({ id: this.id, owner: this.owner, lines });
  }

  removeLine(variantId: string): Cart {
    return Cart.create({
      id: this.id,
      owner: this.owner,
      lines: this._lines.filter((l) => l.variantId !== variantId),
    });
  }

  /** Union another cart's lines into this one, summing quantities on collision. */
  mergeWith(other: Cart): Cart {
    return other.lines.reduce((cart, line) => cart.addLine(line), Cart.create({
      id: this.id,
      owner: this.owner,
      lines: [...this._lines],
    }));
  }

  subtotal(currency: string): Money {
    return this._lines.reduce((total, l) => total.add(l.subtotal), Money.zero(currency));
  }
}
