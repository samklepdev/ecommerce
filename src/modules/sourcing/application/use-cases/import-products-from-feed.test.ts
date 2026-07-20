import { describe, expect, it } from 'vitest';

import { ImportProductsFromFeed } from './import-products-from-feed';
import { CreateProduct } from '@/modules/catalog/application/use-cases/create-product';
import { CreateProductVariant } from '@/modules/catalog/application/use-cases/create-product-variant';
import { CreateSupplierOffer } from '@/modules/sourcing/application/use-cases/create-supplier-offer';
import { err, ok } from '@/shared/domain/result';
import type { Product } from '@/modules/catalog/domain/product';
import type { ProductVariant } from '@/modules/catalog/domain/product-variant';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';
import type { SupplierOfferRepository } from '@/modules/sourcing/application/ports/supplier-offer-repository';
import type { FeedListing, FetchFeedError, SupplierFeedFetcher } from '@/modules/sourcing/application/ports/supplier-feed-fetcher';
import type { ImageStorage } from '@/shared/application/ports/image-storage';

function makeListing(overrides: Partial<FeedListing> = {}): FeedListing {
  return {
    externalId: 'ext-1',
    slug: 'widget-x',
    name: 'Widget X',
    description: null,
    imageUrl: null,
    priceMinor: 1000,
    currency: 'USD',
    available: true,
    productUrl: 'https://supplier.example.com/widget-x',
    ...overrides,
  };
}

function makeFakeProducts(existingSlugs: Set<string> = new Set()) {
  const createdProducts: Product[] = [];
  const createdVariants: ProductVariant[] = [];
  const updatedImages: { productId: string; imageUrl: string }[] = [];
  const repo: Partial<ProductRepository> = {
    async findBySlug(slug) {
      return existingSlugs.has(slug) ? ({ id: `existing-${slug}` } as Product) : null;
    },
    async createProduct(product) {
      createdProducts.push(product);
    },
    async createVariant(variant) {
      createdVariants.push(variant);
    },
    async updateImageUrl(productId, imageUrl) {
      updatedImages.push({ productId, imageUrl });
    },
  };
  return { repo: repo as ProductRepository, createdProducts, createdVariants, updatedImages };
}

function makeFakeSupplierOffers() {
  const created: string[] = [];
  const repo: Partial<SupplierOfferRepository> = {
    async create(offer) {
      created.push(offer.variantId);
    },
    async findPreferredByVariantId() {
      return null;
    },
  };
  return { repo: repo as SupplierOfferRepository, created };
}

function makeFakeImageStorage(url: string | null) {
  const storage: ImageStorage = {
    async store() {
      return url;
    },
    async storeUploadedFile() {
      return null;
    },
  };
  return storage;
}

function makeFakeFetcher(overrides: Partial<SupplierFeedFetcher> = {}) {
  const calls: { fetchListings?: string } = {};
  const fetcher: SupplierFeedFetcher = {
    async fetchListings(feedUrl) {
      calls.fetchListings = feedUrl;
      return ok([]);
    },
    parseListings() {
      return ok([]);
    },
    async parseSpreadsheet() {
      return ok([]);
    },
    ...overrides,
  };
  return { fetcher, calls };
}

function makeImporter(
  fetcher: SupplierFeedFetcher,
  products: ReturnType<typeof makeFakeProducts>,
  offers: ReturnType<typeof makeFakeSupplierOffers>,
  imageStorage: ImageStorage,
) {
  return new ImportProductsFromFeed(
    fetcher,
    products.repo,
    new CreateProduct(products.repo),
    new CreateProductVariant(products.repo),
    new CreateSupplierOffer(offers.repo),
    imageStorage,
  );
}

describe('ImportProductsFromFeed', () => {
  it('creates a product, variant, and supplier offer for each new listing', async () => {
    const products = makeFakeProducts();
    const offers = makeFakeSupplierOffers();
    const { fetcher } = makeFakeFetcher({ async fetchListings() { return ok([makeListing()]); } });
    const importer = makeImporter(fetcher, products, offers, makeFakeImageStorage(null));

    const result = await importer.execute({ supplierId: 'sup-1', source: 'url', feedUrl: 'https://feed.example.com' });

    expect(result).toEqual({ status: 'ok', created: 1, skipped: 0 });
    expect(products.createdProducts).toHaveLength(1);
    expect(products.createdProducts[0]?.status).toBe('draft'); // invisible until reviewed
    expect(products.createdVariants).toHaveLength(1);
    expect(offers.created).toHaveLength(1);
  });

  it('skips a listing whose slug already exists rather than overwriting it', async () => {
    const products = makeFakeProducts(new Set(['widget-x']));
    const offers = makeFakeSupplierOffers();
    const { fetcher } = makeFakeFetcher({ async fetchListings() { return ok([makeListing()]); } });
    const importer = makeImporter(fetcher, products, offers, makeFakeImageStorage(null));

    const result = await importer.execute({ supplierId: 'sup-1', source: 'url', feedUrl: 'https://feed.example.com' });

    expect(result).toEqual({ status: 'ok', created: 0, skipped: 1 });
    expect(products.createdProducts).toHaveLength(0);
  });

  it('downloads and attaches the listing image when storage succeeds', async () => {
    const products = makeFakeProducts();
    const offers = makeFakeSupplierOffers();
    const { fetcher } = makeFakeFetcher({
      async fetchListings() {
        return ok([makeListing({ imageUrl: 'https://supplier.example.com/img.png' })]);
      },
    });
    const importer = makeImporter(fetcher, products, offers, makeFakeImageStorage('https://cdn.example.com/img.png'));

    await importer.execute({ supplierId: 'sup-1', source: 'url', feedUrl: 'https://feed.example.com' });

    expect(products.updatedImages).toEqual([
      { productId: products.createdProducts[0]!.id, imageUrl: 'https://cdn.example.com/img.png' },
    ]);
  });

  it('does not fail the import when the listing image fails to download', async () => {
    const products = makeFakeProducts();
    const offers = makeFakeSupplierOffers();
    const { fetcher } = makeFakeFetcher({
      async fetchListings() {
        return ok([makeListing({ imageUrl: 'https://supplier.example.com/img.png' })]);
      },
    });
    const importer = makeImporter(fetcher, products, offers, makeFakeImageStorage(null));

    const result = await importer.execute({ supplierId: 'sup-1', source: 'url', feedUrl: 'https://feed.example.com' });

    expect(result.status).toBe('ok');
    expect(result.created).toBe(1);
    expect(products.updatedImages).toHaveLength(0);
  });

  it('continues past a listing that fails to create, still processing the rest', async () => {
    const products = makeFakeProducts();
    const offers = makeFakeSupplierOffers();
    let call = 0;
    const originalCreateVariant = products.repo.createVariant.bind(products.repo);
    products.repo.createVariant = async (variant) => {
      call += 1;
      if (call === 1) throw new Error('db error on first listing');
      return originalCreateVariant(variant);
    };
    const { fetcher } = makeFakeFetcher({
      async fetchListings() {
        return ok([makeListing({ slug: 'bad-one' }), makeListing({ slug: 'good-one' })]);
      },
    });
    const importer = makeImporter(fetcher, products, offers, makeFakeImageStorage(null));

    const result = await importer.execute({ supplierId: 'sup-1', source: 'url', feedUrl: 'https://feed.example.com' });

    expect(result).toEqual({ status: 'ok', created: 1, skipped: 0 });
  });

  it.each([
    [{ code: 'robots_disallowed' } as FetchFeedError, 'blocked', 'Disallowed by robots.txt'],
    [{ code: 'blocked', httpStatus: 403 } as FetchFeedError, 'blocked', 'Blocked (HTTP 403)'],
    [{ code: 'parse_error', message: 'bad json' } as FetchFeedError, 'error', 'bad json'],
    [{ code: 'network_error', message: 'timed out' } as FetchFeedError, 'error', 'timed out'],
  ])('maps fetch error %o to status/message', async (error, expectedStatus, expectedMessage) => {
    const products = makeFakeProducts();
    const offers = makeFakeSupplierOffers();
    const { fetcher } = makeFakeFetcher({ async fetchListings() { return err(error); } });
    const importer = makeImporter(fetcher, products, offers, makeFakeImageStorage(null));

    const result = await importer.execute({ supplierId: 'sup-1', source: 'url', feedUrl: 'https://feed.example.com' });

    expect(result.status).toBe(expectedStatus);
    expect(result.message).toBe(expectedMessage);
    expect(result.created).toBe(0);
  });

  it('merges queryParams onto the feed URL for source: url', async () => {
    const products = makeFakeProducts();
    const offers = makeFakeSupplierOffers();
    const { fetcher, calls } = makeFakeFetcher();
    const importer = makeImporter(fetcher, products, offers, makeFakeImageStorage(null));

    await importer.execute({
      supplierId: 'sup-1',
      source: 'url',
      feedUrl: 'https://feed.example.com/items',
      queryParams: 'page=2&per_page=50',
    });

    expect(calls.fetchListings).toBe('https://feed.example.com/items?page=2&per_page=50');
  });

  it('parses JSON directly (no fetch) for source: json', async () => {
    const products = makeFakeProducts();
    const offers = makeFakeSupplierOffers();
    const { fetcher } = makeFakeFetcher({ parseListings: () => ok([makeListing()]) });
    const importer = makeImporter(fetcher, products, offers, makeFakeImageStorage(null));

    const result = await importer.execute({ supplierId: 'sup-1', source: 'json', rawJson: '[]' });

    expect(result).toEqual({ status: 'ok', created: 1, skipped: 0 });
  });

  it('parses an uploaded spreadsheet for source: spreadsheet', async () => {
    const products = makeFakeProducts();
    const offers = makeFakeSupplierOffers();
    const { fetcher } = makeFakeFetcher({ async parseSpreadsheet() { return ok([makeListing()]); } });
    const importer = makeImporter(fetcher, products, offers, makeFakeImageStorage(null));

    const result = await importer.execute({
      supplierId: 'sup-1',
      source: 'spreadsheet',
      fileBuffer: Buffer.from('csv,data'),
    });

    expect(result).toEqual({ status: 'ok', created: 1, skipped: 0 });
  });
});
