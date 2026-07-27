import { describe, expect, it } from 'vitest';

import { isNavItemActive } from './nav-items';

describe('isNavItemActive', () => {
  it('lights the entry for its own page', () => {
    expect(isNavItemActive('/admin/analytics', '/admin/analytics')).toBe(true);
  });

  it('keeps the parent entry lit on a sub-route', () => {
    expect(isNavItemActive('/admin/analytics', '/admin/analytics/page-views')).toBe(true);
  });

  it('does not light an unrelated entry', () => {
    expect(isNavItemActive('/admin/orders', '/admin/analytics')).toBe(false);
  });

  it('does not light an entry whose href is only a string prefix of the path', () => {
    // /admin/order must not match /admin/orders — the boundary is a path
    // segment, not a character count.
    expect(isNavItemActive('/admin/order', '/admin/orders')).toBe(false);
  });

  it('lights Dashboard only on /admin itself, not on every admin page', () => {
    expect(isNavItemActive('/admin', '/admin')).toBe(true);
    expect(isNavItemActive('/admin', '/admin/analytics')).toBe(false);
  });
});
