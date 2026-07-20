import { describe, expect, it } from 'vitest';
import { slugify } from './slugify';

describe('slugify', () => {
  it('lowercases and joins words with hyphens', () => {
    expect(slugify('Widget X')).toBe('widget-x');
  });

  it('collapses runs of punctuation/whitespace into a single hyphen', () => {
    expect(slugify('Widget   --  X!!')).toBe('widget-x');
  });

  it('strips leading and trailing hyphens', () => {
    expect(slugify('  --Widget X--  ')).toBe('widget-x');
  });

  it('returns an empty string for all-symbol input', () => {
    expect(slugify('!!!???')).toBe('');
  });

  it('returns an empty string for empty input', () => {
    expect(slugify('')).toBe('');
  });

  it('strips accented/unicode letters since the pattern is ASCII-only', () => {
    expect(slugify('Café Déjà Vu')).toBe('caf-d-j-vu');
  });

  it('preserves numbers', () => {
    expect(slugify('Model 3000 XL')).toBe('model-3000-xl');
  });

  it('leaves an already-hyphenated slug unchanged', () => {
    expect(slugify('already-a-slug')).toBe('already-a-slug');
  });
});
