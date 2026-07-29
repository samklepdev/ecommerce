import { randomUUID } from 'node:crypto';

import type { UseCase } from '@/shared/application/use-case';
import { logger } from '@/shared/infrastructure/logger';
import type {
  InquiryNotifier,
  InquiryRepository,
} from '@/modules/inquiries/application/ports/inquiry-repository';

export interface SubmitInquiryInput {
  subject: string;
  message: string;
  customerEmail: string;
  userId?: string | null;
}

export interface SubmitInquiryResult {
  id: string;
}

/**
 * A customer asking us to find something we don't stock.
 *
 * No product lookup and no failure branch: the whole point is that the thing
 * being asked about isn't in the catalog, so there is nothing to validate it
 * against beyond the shape of the message itself.
 *
 * The record is written first and the email second, and a failed email does
 * **not** fail the submission: the inquiry is already durable, and telling
 * the customer their message didn't send when it's sitting in the admin
 * queue would be a lie that costs a sale. The failure is logged instead.
 *
 * That ordering is the reason these are rows rather than just mail. An inbox
 * has no notion of "answered" and no way for one admin to see another
 * already picked it up.
 */
export class SubmitInquiry implements UseCase<SubmitInquiryInput, SubmitInquiryResult> {
  constructor(
    private readonly inquiries: InquiryRepository,
    private readonly notifier: InquiryNotifier,
  ) {}

  async execute(input: SubmitInquiryInput): Promise<SubmitInquiryResult> {
    const id = randomUUID();
    const inquiry = {
      id,
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
      });
    } catch (e) {
      logger.error('inquiry saved but the notification email failed', {
        inquiryId: id,
        error: e instanceof Error ? e.message : String(e),
      });
    }

    return { id };
  }
}
