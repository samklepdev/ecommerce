import { describe, expect, it } from 'vitest';
import { Supplier } from './supplier';

describe('Supplier.create', () => {
  it('creates a supplier with a non-empty name', () => {
    const supplier = Supplier.create({ id: '1', name: 'Acme', url: 'https://acme.example.com', notes: null });
    expect(supplier.name).toBe('Acme');
  });

  it('throws on an empty name', () => {
    expect(() => Supplier.create({ id: '1', name: '', url: 'https://acme.example.com', notes: null })).toThrow(
      'non-empty name',
    );
  });

  it('throws on a whitespace-only name', () => {
    expect(() => Supplier.create({ id: '1', name: '   ', url: 'https://acme.example.com', notes: null })).toThrow(
      'non-empty name',
    );
  });
});
