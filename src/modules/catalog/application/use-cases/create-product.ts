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
  category?: string | null;
  sku: string;
  unitAmountMinor: number;
  currency: string;
}

export class CreateProduct implements UseCase<CreateProductInput, Product> {
  constructor(private readonly products: ProductRepository) {}

  async execute(input: CreateProductInput): Promise<Product> {
    const product = Product.create({
      id: randomUUID(),
      slug: Slug.create(input.slug),
      name: input.name,
      description: input.description ?? null,
      status: input.status ?? 'active',
      source: input.source ?? 'manual',
      category: input.category ?? null,
      sku: input.sku,
      price: Money.of(input.unitAmountMinor, input.currency),
    });
    await this.products.createProduct(product);
    return product;
  }
}
