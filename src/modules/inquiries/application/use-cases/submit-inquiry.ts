import { randomUUID } from 'node:crypto';

import type { UseCase } from '@/shared/application/use-case';
import { err, ok, type Result } from '@/shared/domain/result';
import { logger } from '@/shared/infrastructure/logger';
import type { InquiryKind } from '@/modules/inquiries/domain/inquiry';
import type {
  InquiryNotifier,
  InquiryRepository,
} from '@/modules/inquiries/application/ports/inquiry-repository';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';

export interface SubmitInquiryInput {
  kind: InquiryKind;
  /** Only for a question about something we stock. */
  productId?: string | null;
  subject: string;
  message: string;
  customerEmail: string;
  userId?: string | null;
}

export interface SubmitInquiryResult {
  id: string;
}

export type SubmitInquiryError = { code: 'product_unavailable' };

/**
 * A customer asking about a product, or asking us to find one.
 *
 * The record is written first and the email second, and a failed email does
 * **not** fail the submission: the inquiry is already durable, and telling
 * the customer their message didn't send when it's sitting in the admin
 * queue would be a lie that costs a sale. The failure is logged instead.
 *
 * That ordering is the whole reason these are rows rather than just mail.
 * An inbox has no notion of "answered", no link back to the product, and no
 * way for one admin to see another already picked it up.
 */
export class SubmitInquiry
  implements UseCase<SubmitInquiryInput, Result<SubmitInquiryResult, SubmitInquiryError>>
{
  constructor(
    private readonly inquiries: InquiryRepository,
    private readonly products: ProductRepository,
    private readonly notifier: InquiryNotifier,
  ) {}

  async execute(
    input: SubmitInquiryInput,
  ): Promise<Result<SubmitInquiryResult, SubmitInquiryError>> {
    let productName: string | null = null;

    if (input.kind === 'question') {
      // Active-only: a question is about something on sale. Sourcing
      // requests carry no product id at all, which is the point of them.
      const product = input.productId ? await this.products.findById(input.productId) : null;
      if (!product) return err({ code: 'product_unavailable' });
      productName = product.name;
    }

    const id = randomUUID();
    const inquiry = {
      id,
      kind: input.kind,
      productId: input.kind === 'question' ? (input.productId ?? null) : null,
      subject: input.subject.trim(),
      message: input.message.trim(),
      customerEmail: input.customerEmail.trim(),
      userId: input.userId ?? null,
    };

    await this.inquiries.create(inquiry);

    try {
      await this.notifier.notifyNewInquiry({
        ...inquiry,
        status: 'new',
        adminNotes: null,
        createdAt: new Date(),
        productName,
      });
    } catch (e) {
      logger.error('inquiry saved but the notification email failed', {
        inquiryId: id,
        error: e instanceof Error ? e.message : String(e),
      });
    }

    return ok({ id });
  }
}
