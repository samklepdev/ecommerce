'use server';

import { z } from 'zod';

import { getContainer } from '@/composition/container';
import { getSessionUser } from '@/app/lib/session';
import { checkRateLimit, getClientIp, tooManyAttemptsMessage } from '@/app/lib/rate-limit';

const InquirySchema = z.object({
  subject: z.string().min(3).max(140),
  message: z.string().min(10).max(2000),
  customerEmail: z.string().email(),
});

export interface SubmitInquiryActionResult {
  message?: string;
  error?: string;
}

/**
 * An unauthenticated form that sends mail, which makes it a spam vector by
 * construction — hence the rate limit, keyed on IP. Five an hour is more
 * than any real customer needs and little enough to be useless as a relay.
 */
export async function submitInquiryAction(
  _prevState: SubmitInquiryActionResult | undefined,
  formData: FormData,
): Promise<SubmitInquiryActionResult> {
  const parsed = InquirySchema.safeParse({
    subject: formData.get('subject'),
    message: formData.get('message'),
    customerEmail: formData.get('customerEmail'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' };
  }

  const ip = await getClientIp();
  const limit = await checkRateLimit(`inquiry:${ip}`, 5, 60 * 60);
  if (!limit.allowed) return { error: tooManyAttemptsMessage(limit.retryAfterSeconds) };

  const user = await getSessionUser();
  const { submitInquiry } = getContainer();
  await submitInquiry.execute({ ...parsed.data, userId: user?.id ?? null });

  return { message: "Thanks — we'll look into sourcing it and reply by email." };
}
