import type { UseCase } from '@/shared/application/use-case';
import type { InquiryStatus } from '@/modules/inquiries/domain/inquiry';
import type {
  Inquiry,
  InquiryRepository,
} from '@/modules/inquiries/application/ports/inquiry-repository';

export interface ListInquiriesInput {
  status: InquiryStatus | 'all';
}

export class ListInquiries implements UseCase<ListInquiriesInput, Inquiry[]> {
  constructor(private readonly inquiries: InquiryRepository) {}

  async execute(input: ListInquiriesInput): Promise<Inquiry[]> {
    return this.inquiries.listByStatus(input.status);
  }
}

/** Feeds the dashboard's attention queue, next to the other things waiting
 * on a human. */
export class CountOpenInquiries implements UseCase<void, number> {
  constructor(private readonly inquiries: InquiryRepository) {}

  async execute(): Promise<number> {
    return this.inquiries.countOpen();
  }
}

export interface SetInquiryStatusInput {
  id: string;
  status: InquiryStatus;
}

export class SetInquiryStatus implements UseCase<SetInquiryStatusInput, void> {
  constructor(private readonly inquiries: InquiryRepository) {}

  async execute(input: SetInquiryStatusInput): Promise<void> {
    await this.inquiries.setStatus(input.id, input.status);
  }
}

export interface SetInquiryNotesInput {
  id: string;
  notes: string | null;
}

export class SetInquiryNotes implements UseCase<SetInquiryNotesInput, void> {
  constructor(private readonly inquiries: InquiryRepository) {}

  async execute(input: SetInquiryNotesInput): Promise<void> {
    await this.inquiries.setNotes(input.id, input.notes?.trim() || null);
  }
}
