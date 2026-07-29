import type { InquiryStatus } from '@/modules/inquiries/domain/inquiry';

/**
 * A customer asking us to source something the catalog doesn't carry.
 *
 * There is no product id and no kind: by definition this is about something
 * that isn't a product here yet. Questions about things we *do* stock go to
 * the support address in the footer, where a mail client is a better tool
 * than a form.
 */
export interface Inquiry {
  id: string;
  subject: string;
  message: string;
  customerEmail: string;
  userId: string | null;
  status: InquiryStatus;
  adminNotes: string | null;
  createdAt: Date;
}

export interface NewInquiry {
  id: string;
  subject: string;
  message: string;
  customerEmail: string;
  userId: string | null;
}

export interface InquiryRepository {
  create(inquiry: NewInquiry): Promise<void>;
  /** Oldest first within a status — the queue is worked front to back. */
  listByStatus(status: InquiryStatus | 'all'): Promise<Inquiry[]>;
  countOpen(): Promise<number>;
  setStatus(id: string, status: InquiryStatus): Promise<void>;
  setNotes(id: string, notes: string | null): Promise<void>;
}

/** Notifies whoever runs the shop that something came in. */
export interface InquiryNotifier {
  notifyNewInquiry(inquiry: Inquiry): Promise<void>;
}
