import { describe, expect, it } from 'vitest';
import { Slug } from './slug';

describe('Slug.create', () => {
  it('accepts a well-formed lowercase-hyphenated slug', () => {
    expect(Slug.create('widget-x').value).toBe('widget-x');
  });

  it('lowercases and trims the raw input', () => {
    expect(Slug.create('  Widget-X  ').value).toBe('widget-x');
  });

  it('accepts a single-word slug', () => {
    expect(Slug.create('widget').value).toBe('widget');
  });

  it('accepts alphanumeric segments', () => {
    expect(Slug.create('widget-2000').value).toBe('widget-2000');
  });

  it('rejects an empty string', () => {
    expect(() => Slug.create('')).toThrow(/Invalid slug/);
  });

  it('rejects consecutive hyphens', () => {
    expect(() => Slug.create('widget--x')).toThrow(/Invalid slug/);
  });

  it('rejects a leading hyphen', () => {
    expect(() => Slug.create('-widget')).toThrow(/Invalid slug/);
  });

  it('rejects a trailing hyphen', () => {
    expect(() => Slug.create('widget-')).toThrow(/Invalid slug/);
  });

  it('rejects spaces', () => {
    expect(() => Slug.create('widget x')).toThrow(/Invalid slug/);
  });

  it('rejects underscores', () => {
    expect(() => Slug.create('widget_x')).toThrow(/Invalid slug/);
  });
});

describe('Slug#toString', () => {
  it('returns the slug value', () => {
    expect(Slug.create('widget-x').toString()).toBe('widget-x');
  });
});
