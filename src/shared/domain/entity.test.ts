import { describe, expect, it } from 'vitest';
import { Entity } from './entity';

class TestEntity extends Entity<string> {
  constructor(id: string) {
    super(id);
  }
}

describe('Entity#equals', () => {
  it('is false when compared to undefined', () => {
    const entity = new TestEntity('1');
    expect(entity.equals(undefined)).toBe(false);
  });

  it('is true for the same reference', () => {
    const entity = new TestEntity('1');
    expect(entity.equals(entity)).toBe(true);
  });

  it('is true for different instances with the same id', () => {
    const a = new TestEntity('1');
    const b = new TestEntity('1');
    expect(a.equals(b)).toBe(true);
  });

  it('is false for different ids', () => {
    const a = new TestEntity('1');
    const b = new TestEntity('2');
    expect(a.equals(b)).toBe(false);
  });
});
