import { describe, expect, it } from 'vitest';

import { AddProductImages } from './add-product-images';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';
import type { ImageStorage } from '@/shared/application/ports/image-storage';

function makeFakeProducts(failingUrls: Set<string> = new Set()) {
  const added: { productId: string; url: string }[] = [];
  const repo: Partial<ProductRepository> = {
    async addProductImage(productId, url) {
      if (failingUrls.has(url)) throw new Error('db error');
      added.push({ productId, url });
    },
  };
  return { repo: repo as ProductRepository, added };
}

function makeFakeStorage(urlByIndex: (string | null)[]) {
  let call = 0;
  const storage: ImageStorage = {
    async store() {
      return null;
    },
    async storeUploadedFile() {
      const url = urlByIndex[call];
      call += 1;
      return url ?? null;
    },
  };
  return storage;
}

const file = { buffer: Buffer.from('bytes'), contentType: 'image/png' };

describe('AddProductImages', () => {
  it('adds every successfully-stored file', async () => {
    const { repo, added } = makeFakeProducts();
    const storage = makeFakeStorage(['https://cdn/1.png', 'https://cdn/2.png']);

    const result = await new AddProductImages(repo, storage).execute({
      productId: 'prod-1',
      files: [file, file],
    });

    expect(result).toEqual({ added: 2, failed: 0 });
    expect(added).toEqual([
      { productId: 'prod-1', url: 'https://cdn/1.png' },
      { productId: 'prod-1', url: 'https://cdn/2.png' },
    ]);
  });

  it('counts a rejected file (storage returns null) as failed without persisting', async () => {
    const { repo, added } = makeFakeProducts();
    const storage = makeFakeStorage([null, 'https://cdn/2.png']);

    const result = await new AddProductImages(repo, storage).execute({
      productId: 'prod-1',
      files: [file, file],
    });

    expect(result).toEqual({ added: 1, failed: 1 });
    expect(added).toEqual([{ productId: 'prod-1', url: 'https://cdn/2.png' }]);
  });

  it('counts a persistence failure (stored ok, repo throws) as failed too', async () => {
    const { repo, added } = makeFakeProducts(new Set(['https://cdn/1.png']));
    const storage = makeFakeStorage(['https://cdn/1.png']);

    const result = await new AddProductImages(repo, storage).execute({
      productId: 'prod-1',
      files: [file],
    });

    expect(result).toEqual({ added: 0, failed: 1 });
    expect(added).toEqual([]);
  });
});
