import { describe, expect, it, vi } from 'vitest';

import { SubmitInquiry } from './submit-inquiry';
import { Product } from '@/modules/catalog/domain/product';
import { Slug } from '@/modules/catalog/domain/slug';
import { Money } from '@/shared/domain/money';
import { logger } from '@/shared/infrastructure/logger';
import { isErr, isOk } from '@/shared/domain/result';
import type {
  InquiryNotifier,
  InquiryRepository,
  NewInquiry,
} from '@/modules/inquiries/application/ports/inquiry-repository';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';

function makeProduct(id: string) {
  return Product.create({
    id,
    slug: Slug.create('signing-device'),
    name: 'Signing device',
    description: null,
    status: 'active',
    sku: 'SKU-1',
    price: Money.of(19900, 'USD'),
  });
}

function makeFakeInquiries() {
  const created: NewInquiry[] = [];
  const repo: Partial<InquiryRepository> = {
    async create(inquiry) {
      created.push(inquiry);
    },
  };
  return { repo: repo as InquiryRepository, created };
}

function makeFakeProducts(products: Product[]) {
  const repo: Partial<ProductRepository> = {
    async findById(id) {
      return products.find((p) => p.id === id) ?? null;
    },
  };
  return repo as ProductRepository;
}

function makeFakeNotifier(fail = false) {
  const sent: { subject: string; productName: string | null }[] = [];
  const notifier: InquiryNotifier = {
    async notifyNewInquiry(inquiry) {
      if (fail) throw new Error('smtp exploded');
      sent.push({ subject: inquiry.subject, productName: inquiry.productName });
    },
  };
  return { notifier, sent };
}

describe('SubmitInquiry', () => {
  it('records a question about a product and notifies the shop', async () => {
    const { repo, created } = makeFakeInquiries();
    const { notifier, sent } = makeFakeNotifier();

    const result = await new SubmitInquiry(
      repo,
      makeFakeProducts([makeProduct('p1')]),
      notifier,
    ).execute({
      kind: 'question',
      productId: 'p1',
      subject: 'Does it ship with a cable?',
      message: '  Wondering about the USB-C cable.  ',
      customerEmail: 'buyer@example.com',
    });

    expect(isOk(result)).toBe(true);
    expect(created[0]).toMatchObject({
      kind: 'question',
      productId: 'p1',
      message: 'Wondering about the USB-C cable.',
    });
    expect(sent[0]?.productName).toBe('Signing device');
  });

  it('records a sourcing request with no product attached', async () => {
    const { repo, created } = makeFakeInquiries();
    const { notifier, sent } = makeFakeNotifier();

    const result = await new SubmitInquiry(repo, makeFakeProducts([]), notifier).execute({
      kind: 'sourcing',
      subject: 'Coldcard Q',
      message: 'Can you get one of these in?',
      customerEmail: 'buyer@example.com',
    });

    expect(isOk(result)).toBe(true);
    expect(created[0]).toMatchObject({ kind: 'sourcing', productId: null });
    expect(sent[0]?.productName).toBeNull();
  });

  // A question is about something on sale; findById is active-only.
  it('refuses a question about a product that is not on sale', async () => {
    const { repo, created } = makeFakeInquiries();
    const { notifier } = makeFakeNotifier();

    const result = await new SubmitInquiry(repo, makeFakeProducts([]), notifier).execute({
      kind: 'question',
      productId: 'gone',
      subject: 'Anything',
      message: 'Anything',
      customerEmail: 'buyer@example.com',
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.code).toBe('product_unavailable');
    expect(created).toHaveLength(0);
  });

  // The record is already durable and sitting in the admin queue. Telling
  // the customer it failed would be a lie that costs a sale.
  it('still succeeds when the notification email fails', async () => {
    const { repo, created } = makeFakeInquiries();
    const { notifier } = makeFakeNotifier(true);
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    const result = await new SubmitInquiry(repo, makeFakeProducts([]), notifier).execute({
      kind: 'sourcing',
      subject: 'Something',
      message: 'Please find me one',
      customerEmail: 'buyer@example.com',
    });

    expect(isOk(result)).toBe(true);
    expect(created).toHaveLength(1);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('drops a product id that came with a sourcing request', async () => {
    const { repo, created } = makeFakeInquiries();
    const { notifier } = makeFakeNotifier();

    await new SubmitInquiry(repo, makeFakeProducts([makeProduct('p1')]), notifier).execute({
      kind: 'sourcing',
      productId: 'p1',
      subject: 'Something else',
      message: 'Please find me one',
      customerEmail: 'buyer@example.com',
    });

    expect(created[0]?.productId).toBeNull();
  });
});
