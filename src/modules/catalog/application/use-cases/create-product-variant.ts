import { randomUUID } from 'node:crypto';

import type { UseCase } from '@/shared/application/use-case';
import { Money } from '@/shared/domain/money';
import { ProductVariant } from '@/modules/catalog/domain/product-variant';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';

export interface CreateProductVariantInput {
  productId: string;
  sku: string;
  name: string;
  unitAmountMinor: number;
  currency: string;
}

export class CreateProductVariant implements UseCase<CreateProductVariantInput, ProductVariant> {
  constructor(private readonly products: ProductRepository) {}

  async execute(input: CreateProductVariantInput): Promise<ProductVariant> {
    const variant = ProductVariant.create({
      id: randomUUID(),
      productId: input.productId,
      sku: input.sku,
      name: input.name,
      price: Money.of(input.unitAmountMinor, input.currency),
    });
    await this.products.createVariant(variant);
    return variant;
  }
}
