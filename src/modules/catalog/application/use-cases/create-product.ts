import { randomUUID } from 'node:crypto';

import type { UseCase } from '@/shared/application/use-case';
import { Money } from '@/shared/domain/money';
import { Product, type ProductSource, type ProductStatus } from '@/modules/catalog/domain/product';
import { Slug } from '@/modules/catalog/domain/slug';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';

export interface CreateProductInput {
  slug: string;
  name: string;
  description?: string | null;
  status?: ProductStatus;
  source?: ProductSource;
  categoryId?: string | null;
  unitAmountMinor: number;
  currency: string;
}

/**
 * Creates a product. **Draft unless told otherwise** — the old default was
 * `active`, which meant a product went live in the instant before its
 * supplier offer was written, and stayed live if writing that offer failed.
 * Nothing sellable should exist before the thing that says where to buy it.
 */
export class CreateProduct implements UseCase<CreateProductInput, Product> {
  constructor(private readonly products: ProductRepository) {}

  async execute(input: CreateProductInput): Promise<Product> {
    const product = Product.create({
      id: randomUUID(),
      slug: Slug.create(input.slug),
      name: input.name,
      description: input.description ?? null,
      status: input.status ?? 'draft',
      source: input.source ?? 'manual',
      categoryId: input.categoryId ?? null,
      price: Money.of(input.unitAmountMinor, input.currency),
    });
    await this.products.createProduct(product);
    return product;
  }
}
