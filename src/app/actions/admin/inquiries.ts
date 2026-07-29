'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { getContainer } from '@/composition/container';
import { requireAdmin } from '@/app/lib/session';
import { INQUIRY_STATUSES } from '@/modules/inquiries/domain/inquiry';

export interface InquiryActionResult {
  message?: string;
  error?: string;
}

const StatusSchema = z.object({
  id: z.string().min(1),
  status: z.enum(INQUIRY_STATUSES as unknown as [string, ...string[]]),
});

export async function setInquiryStatusAction(
  _prevState: InquiryActionResult | undefined,
  formData: FormData,
): Promise<InquiryActionResult> {
  const admin = await requireAdmin();
  const parsed = StatusSchema.safeParse({
    id: formData.get('id'),
    status: formData.get('status'),
  });
  if (!parsed.success) return { error: 'Unknown status.' };

  const { setInquiryStatus, recordAuditLogEntry } = getContainer();
  await setInquiryStatus.execute({
    id: parsed.data.id,
    status: parsed.data.status as 'new' | 'in_progress' | 'closed',
  });

  await recordAuditLogEntry.execute({
    actorUserId: admin.id,
    actorEmail: admin.email,
    action: 'inquiry.status_changed',
    targetType: 'inquiry',
    targetId: parsed.data.id,
    metadata: { status: parsed.data.status },
  });

  revalidatePath('/admin/inquiries');
  return { message: `Marked ${parsed.data.status.replace('_', ' ')}.` };
}

const NotesSchema = z.object({
  id: z.string().min(1),
  notes: z.string().max(2000).optional(),
});

export async function setInquiryNotesAction(
  _prevState: InquiryActionResult | undefined,
  formData: FormData,
): Promise<InquiryActionResult> {
  await requireAdmin();
  const parsed = NotesSchema.safeParse({
    id: formData.get('id'),
    notes: formData.get('notes') || undefined,
  });
  if (!parsed.success) return { error: 'Notes are limited to 2000 characters.' };

  const { setInquiryNotes } = getContainer();
  await setInquiryNotes.execute({ id: parsed.data.id, notes: parsed.data.notes ?? null });

  revalidatePath('/admin/inquiries');
  return { message: 'Notes saved.' };
}
