import { describe, expect, it } from 'vitest';

import { httpUrlSchema } from './url-schema';

describe('httpUrlSchema', () => {
  it('accepts http and https', () => {
    expect(httpUrlSchema.safeParse('https://supplier.example/widget').success).toBe(true);
    expect(httpUrlSchema.safeParse('http://supplier.example/widget').success).toBe(true);
  });

  it('trims surrounding whitespace from a pasted URL', () => {
    const parsed = httpUrlSchema.safeParse('  https://supplier.example/x  ');
    expect(parsed.success && parsed.data).toBe('https://supplier.example/x');
  });

  // `z.string().url()` accepts every one of these. They matter because some
  // of these URLs are fetched server-side and others are rendered as links.
  it('rejects schemes that are not http(s)', () => {
    for (const bad of [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'file:///etc/passwd',
      'ftp://supplier.example/x',
    ]) {
      expect(httpUrlSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('rejects a string that is not a URL at all', () => {
    for (const bad of ['', '   ', 'supplier.example', 'not a url']) {
      expect(httpUrlSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('explains the scheme rule rather than saying "invalid"', () => {
    const parsed = httpUrlSchema.safeParse('javascript:alert(1)');
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues[0]?.message).toMatch(/http/i);
  });
});
