import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// The panel imports server actions, which reach the DI root and its
// env validation. Stubbed here because this is a test of the view.
vi.mock('@/app/actions/admin/catalog', () => ({
  updateProductAction: async () => ({}),
  updateSupplierOfferCostAction: async () => ({}),
  addSupplierOfferAction: async () => ({}),
  setPreferredSupplierOfferAction: async () => ({}),
  addProductImagesAction: async () => ({}),
  removeProductImageAction: async () => ({}),
  removePrimaryProductImageAction: async () => ({}),
}));

import { ProductEditPanel } from './ProductEditPanel';
import type { AdminProductRow } from './AdminProductsTable';

function makeProduct(overrides: Partial<AdminProductRow> = {}): AdminProductRow {
  return {
    id: 'p1',
    name: 'Widget X',
    description: 'A widget.',
    slug: 'widget-x',
    status: 'active',
    category: 'Widgets',
    imageUrl: null,
    additionalImages: [],
    sku: 'SKU-1',
    priceAmountMinor: 2499,
    currency: 'USD',
    hasNoOffers: false,
    offers: [
      {
        id: 'o1',
        supplierId: 's1',
        supplierName: 'Acme',
        isPreferred: true,
        costAmountMinor: 1000,
        currency: 'USD',
      },
    ],
    ...overrides,
  };
}

function render(product = makeProduct()) {
  return renderToStaticMarkup(
    <ProductEditPanel
      product={product}
      suppliers={[{ id: 's1', name: 'Acme' }]}
      actions={null}
    />,
  );
}

describe('ProductEditPanel', () => {
  // The point of the panel: the product's own fields save together, rather
  // than each carrying its own button the way the inline editors did.
  it('saves every product field under one button', () => {
    const html = render();

    expect(html).toContain('Save changes');
    for (const field of ['name="name"', 'name="price"', 'name="category"', 'name="description"']) {
      expect(html).toContain(field);
    }
  });

  it('carries the current values into the fields', () => {
    const html = render();

    expect(html).toContain('value="Widget X"');
    expect(html).toContain('value="24.99"'); // minor units shown as decimal
    expect(html).toContain('value="Widgets"');
    expect(html).toContain('A widget.');
  });

  it('shows the slug but never lets it be edited', () => {
    const html = render();

    expect(html).toContain('widget-x');
    // Disabled inputs aren't submitted, so the permanent slug can't ride
    // along in the form even if the markup changes around it.
    // Attribute order isn't guaranteed, so match the input as a whole.
    expect(html).toMatch(/<input[^>]*disabled[^>]*value="widget-x"[^>]*\/>/);
    expect(html).not.toMatch(/name="slug"/);
  });

  it('says so when a product has no supplier offer', () => {
    const html = render(makeProduct({ offers: [], hasNoOffers: true }));

    // React escapes the apostrophe in the rendered markup.
    expect(html).toContain('fulfilled until it has one');
  });
});
