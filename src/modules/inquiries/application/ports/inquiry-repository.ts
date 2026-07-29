import type { InquiryKind, InquiryStatus } from '@/modules/inquiries/domain/inquiry';

export interface Inquiry {
  id: string;
  kind: InquiryKind;
  productId: string | null;
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
  kind: InquiryKind;
  productId: string | null;
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
  notifyNewInquiry(inquiry: Inquiry & { productName: string | null }): Promise<void>;
}
