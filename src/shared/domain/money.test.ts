import { describe, expect, it } from 'vitest';
import { Money } from './money';

describe('Money.of', () => {
  it('creates a Money with the given amount and uppercased currency', () => {
    const m = Money.of(1999, 'usd');
    expect(m.amountMinor).toBe(1999);
    expect(m.currency).toBe('USD');
  });

  it('throws for a non-integer amount', () => {
    expect(() => Money.of(19.99, 'USD')).toThrow(/integer minor-unit value/);
  });

  it('throws for a currency code that is not 3 letters', () => {
    expect(() => Money.of(100, 'US')).toThrow(/3-letter ISO 4217 code/);
    expect(() => Money.of(100, 'USDD')).toThrow(/3-letter ISO 4217 code/);
  });
});

describe('Money.zero', () => {
  it('creates a zero-amount Money in the given currency', () => {
    const m = Money.zero('EUR');
    expect(m.amountMinor).toBe(0);
    expect(m.currency).toBe('EUR');
  });
});

describe('Money#add', () => {
  it('adds two amounts in the same currency', () => {
    const result = Money.of(1000, 'USD').add(Money.of(250, 'USD'));
    expect(result.amountMinor).toBe(1250);
    expect(result.currency).toBe('USD');
  });

  it('throws on a currency mismatch', () => {
    expect(() => Money.of(1000, 'USD').add(Money.of(250, 'EUR'))).toThrow(/Currency mismatch/);
  });
});

describe('Money#subtract', () => {
  it('subtracts two amounts in the same currency', () => {
    const result = Money.of(1000, 'USD').subtract(Money.of(250, 'USD'));
    expect(result.amountMinor).toBe(750);
  });

  it('throws on a currency mismatch', () => {
    expect(() => Money.of(1000, 'USD').subtract(Money.of(250, 'EUR'))).toThrow(/Currency mismatch/);
  });
});

describe('Money#multiply', () => {
  it('multiplies the amount by an integer factor', () => {
    const result = Money.of(500, 'USD').multiply(3);
    expect(result.amountMinor).toBe(1500);
  });

  it('throws for a non-integer factor', () => {
    expect(() => Money.of(500, 'USD').multiply(1.5)).toThrow(/integer factor/);
  });
});

describe('Money#equals', () => {
  it('is true for the same amount and currency', () => {
    expect(Money.of(500, 'USD').equals(Money.of(500, 'USD'))).toBe(true);
  });

  it('is false for a different amount', () => {
    expect(Money.of(500, 'USD').equals(Money.of(501, 'USD'))).toBe(false);
  });

  it('is false for a different currency', () => {
    expect(Money.of(500, 'USD').equals(Money.of(500, 'EUR'))).toBe(false);
  });
});

describe('Money#toString', () => {
  it('renders as "<amountMinor> <currency>"', () => {
    expect(Money.of(1999, 'USD').toString()).toBe('1999 USD');
  });
});

describe('Money#toDisplayString', () => {
  it('renders a typical amount with a decimal point and currency symbol', () => {
    expect(Money.of(1999, 'USD').toDisplayString()).toBe('$19.99');
  });

  it('renders a whole-dollar amount with trailing zeros', () => {
    expect(Money.of(2000, 'USD').toDisplayString()).toBe('$20.00');
  });

  it('renders zero', () => {
    expect(Money.of(0, 'USD').toDisplayString()).toBe('$0.00');
  });

  it('includes a thousands separator for large amounts', () => {
    expect(Money.of(100_000_000, 'USD').toDisplayString()).toBe('$1,000,000.00');
  });

  it('uses the currency symbol for a non-USD currency', () => {
    expect(Money.of(1999, 'EUR').toDisplayString()).toBe('€19.99');
  });
});

describe('toDecimalString', () => {
  /**
   * For exports, where the value lands in a spreadsheet column next to bank
   * figures. `toDisplayString`'s symbol and separators would make it text;
   * the raw `amountMinor` would be wrong by two orders of magnitude — the kind
   * of reconciliation error nobody notices until it matters.
   */
  it('renders minor units as a plain decimal', () => {
    expect(Money.of(2080, 'USD').toDecimalString()).toBe('20.80');
  });

  it('pads the minor part', () => {
    expect(Money.of(2005, 'USD').toDecimalString()).toBe('20.05');
    expect(Money.of(2000, 'USD').toDecimalString()).toBe('20.00');
  });

  it('handles amounts under a major unit', () => {
    expect(Money.of(80, 'USD').toDecimalString()).toBe('0.80');
    expect(Money.of(5, 'USD').toDecimalString()).toBe('0.05');
    expect(Money.of(0, 'USD').toDecimalString()).toBe('0.00');
  });

  it('keeps a negative amount readable rather than mangling the minor part', () => {
    // Naive division would give `-20.-80`; the sign has to come off first.
    expect(Money.of(-2080, 'USD').toDecimalString()).toBe('-20.80');
    expect(Money.of(-5, 'USD').toDecimalString()).toBe('-0.05');
  });

  it('carries no currency symbol or separators, so it stays arithmetic', () => {
    expect(Money.of(123456789, 'USD').toDecimalString()).toBe('1234567.89');
  });
});
