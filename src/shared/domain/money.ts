/**
 * Integer minor units + currency. Never a float. All arithmetic stays inside
 * this class so `price * quantity` on raw numbers can never happen elsewhere.
 */
export class Money {
  private constructor(
    readonly amountMinor: number,
    readonly currency: string,
  ) {}

  static of(amountMinor: number, currency: string): Money {
    if (!Number.isInteger(amountMinor)) {
      throw new Error(`Money amount must be an integer minor-unit value, got ${amountMinor}`);
    }
    if (currency.length !== 3) {
      throw new Error(`Money currency must be a 3-letter ISO 4217 code, got "${currency}"`);
    }
    return new Money(amountMinor, currency.toUpperCase());
  }

  static zero(currency: string): Money {
    return Money.of(0, currency);
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.of(this.amountMinor + other.amountMinor, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.of(this.amountMinor - other.amountMinor, this.currency);
  }

  multiply(factor: number): Money {
    if (!Number.isInteger(factor)) {
      throw new Error(`Money can only be multiplied by an integer factor, got ${factor}`);
    }
    return Money.of(this.amountMinor * factor, this.currency);
  }

  equals(other: Money): boolean {
    return this.amountMinor === other.amountMinor && this.currency === other.currency;
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new Error(`Currency mismatch: ${this.currency} vs ${other.currency}`);
    }
  }

  toString(): string {
    return `${this.amountMinor} ${this.currency}`;
  }

  /** User-facing formatted price (e.g. "$19.99") — assumes a 2-decimal-place
   * fiat currency, same assumption already made in the BTC gateway's sats
   * conversion. Locale is fixed (not the server's default) for deterministic
   * output across environments. */
  toDisplayString(): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: this.currency }).format(
      this.amountMinor / 100,
    );
  }
}
