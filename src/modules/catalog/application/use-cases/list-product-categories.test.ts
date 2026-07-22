import { describe, expect, it } from 'vitest';

import { ListProductCategories } from './list-product-categories';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';

describe('ListProductCategories', () => {
  it('delegates to the repository', async () => {
    const repo: Partial<ProductRepository> = {
      async listCategories() {
        return ['Widgets', 'Gadgets'];
      },
    };

    const result = await new ListProductCategories(repo as ProductRepository).execute();

    expect(result).toEqual(['Widgets', 'Gadgets']);
  });
});
