import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// Stubbed for the same reason as the edit panel's test: importing the real
// action reaches the DI root and its env validation.
vi.mock('@/app/actions/admin/catalog', () => ({
  createSupplierAction: async () => ({}),
}));

import { AddSupplierForm } from './AddSupplierForm';

describe('AddSupplierForm', () => {
  // The modal forms were restyled to match the edit panel: one submit, in a
  // footer, with the fields above it.
  it('puts its single submit in a footer below the fields', () => {
    const html = renderToStaticMarkup(<AddSupplierForm />);

    expect((html.match(/type="submit"/g) ?? []).length).toBe(1);
    expect(html).toContain('modalForm');
    expect(html).toContain('modalFooter');
    // Footer comes after the last field, not floating between them.
    expect(html.indexOf('modalFooter')).toBeGreaterThan(html.lastIndexOf('name="notes"'));
  });
});
