/** What the customer wrote in about. */
export type InquiryKind = 'question' | 'sourcing';

/**
 * Where it is in the admin's queue. Not a state machine with guarded
 * transitions like orders — nothing here touches money, and an admin
 * reopening something they closed by accident should just be able to.
 */
export type InquiryStatus = 'new' | 'in_progress' | 'closed';

export const INQUIRY_STATUSES: readonly InquiryStatus[] = ['new', 'in_progress', 'closed'];

export function isInquiryStatus(value: string): value is InquiryStatus {
  return (INQUIRY_STATUSES as readonly string[]).includes(value);
}

/** Open means "still someone's problem" — what the admin badge counts. */
export function isOpen(status: InquiryStatus): boolean {
  return status !== 'closed';
}
