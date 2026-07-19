import { describe, expect, it } from 'vitest';
import { isRateLimited } from './rate-limiter';

describe('isRateLimited', () => {
  it('is not limited when the count is below the limit', () => {
    expect(isRateLimited(3, 5)).toBe(false);
  });

  it('is not limited when the count equals the limit', () => {
    expect(isRateLimited(5, 5)).toBe(false);
  });

  it('is limited once the count exceeds the limit', () => {
    expect(isRateLimited(6, 5)).toBe(true);
  });

  it('is limited for a zero limit and any positive count', () => {
    expect(isRateLimited(1, 0)).toBe(true);
  });
});
