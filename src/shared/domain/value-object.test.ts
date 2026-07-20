import { describe, expect, it } from 'vitest';
import { ValueObject } from './value-object';

class Point extends ValueObject<{ x: number; y: number }> {
  constructor(x: number, y: number) {
    super({ x, y });
  }
}

class OtherValueObject extends ValueObject<{ x: number; y: number }> {
  constructor(x: number, y: number) {
    super({ x, y });
  }
}

describe('ValueObject#equals', () => {
  it('is false when compared to undefined', () => {
    const point = new Point(1, 2);
    expect(point.equals(undefined)).toBe(false);
  });

  it('is true for two instances of the same class with identical props', () => {
    const a = new Point(1, 2);
    const b = new Point(1, 2);
    expect(a.equals(b)).toBe(true);
  });

  it('is false for instances with different prop values', () => {
    const a = new Point(1, 2);
    const b = new Point(1, 3);
    expect(a.equals(b)).toBe(false);
  });

  it('is false when compared across different value-object classes, even with identical props', () => {
    const a = new Point(1, 2);
    const b = new OtherValueObject(1, 2);
    expect(a.equals(b)).toBe(false);
  });
});
