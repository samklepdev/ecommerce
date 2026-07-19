import { randomUUID } from 'node:crypto';

import type { UseCase } from '@/shared/application/use-case';
import { Product, type ProductSource, type ProductStatus } from '@/modules/catalog/domain/product';
import { Slug } from '@/modules/catalog/domain/slug';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';

export interface CreateProductInput {
  slug: string;
  name: string;
  description?: string | null;
  status?: ProductStatus;
  source?: ProductSource;
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
      variants: [],
    });
    await this.products.createProduct(product);
    return product;
  }
}
