import { describe, expect, it, vi } from 'vitest';

import { SubmitInquiry } from './submit-inquiry';
import { logger } from '@/shared/infrastructure/logger';
import type {
  Inquiry,
  InquiryNotifier,
  InquiryRepository,
  NewInquiry,
} from '@/modules/inquiries/application/ports/inquiry-repository';

function makeFakeInquiries() {
  const created: NewInquiry[] = [];
  const repo: Partial<InquiryRepository> = {
    async create(inquiry) {
      created.push(inquiry);
    },
  };
  return { repo: repo as InquiryRepository, created };
}

function makeFakeNotifier(fail = false) {
  const sent: Inquiry[] = [];
  const notifier: InquiryNotifier = {
    async notifyNewInquiry(inquiry) {
      if (fail) throw new Error('smtp exploded');
      sent.push(inquiry);
    },
  };
  return { notifier, sent };
}

describe('SubmitInquiry', () => {
  it('records the request and notifies the shop', async () => {
    const { repo, created } = makeFakeInquiries();
    const { notifier, sent } = makeFakeNotifier();

    const result = await new SubmitInquiry(repo, notifier).execute({
      subject: 'Coldcard Q',
      message: '  Can you get one of these in?  ',
      customerEmail: 'buyer@example.com',
    });

    expect(result.id).toBeTruthy();
    expect(created[0]).toMatchObject({
      subject: 'Coldcard Q',
      message: 'Can you get one of these in?',
      customerEmail: 'buyer@example.com',
      userId: null,
    });
    expect(sent[0]?.status).toBe('new');
  });

  it('attaches the account when the sender was signed in', async () => {
    const { repo, created } = makeFakeInquiries();
    const { notifier } = makeFakeNotifier();

    await new SubmitInquiry(repo, notifier).execute({
      subject: 'A thing',
      message: 'Please find me one',
      customerEmail: 'buyer@example.com',
      userId: 'user-1',
    });

    expect(created[0]?.userId).toBe('user-1');
  });

  // The record is already durable and sitting in the admin queue. Telling
  // the customer it failed would be a lie that costs a sale.
  it('still succeeds when the notification email fails', async () => {
    const { repo, created } = makeFakeInquiries();
    const { notifier } = makeFakeNotifier(true);
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    const result = await new SubmitInquiry(repo, notifier).execute({
      subject: 'Something',
      message: 'Please find me one',
      customerEmail: 'buyer@example.com',
    });

    expect(result.id).toBeTruthy();
    expect(created).toHaveLength(1);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
