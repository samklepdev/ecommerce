'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { getContainer } from '@/composition/container';
import { isErr } from '@/shared/domain/result';
import { requireAdmin } from '@/app/lib/session';

const PromoteUserToAdminSchema = z.object({
  email: z.string().email(),
});

export interface PromoteUserToAdminActionResult {
  message?: string;
  error?: string;
}

export async function promoteUserToAdminAction(
  _prevState: PromoteUserToAdminActionResult | undefined,
  formData: FormData,
): Promise<PromoteUserToAdminActionResult> {
  const admin = await requireAdmin();
  const parsed = PromoteUserToAdminSchema.safeParse({ email: formData.get('email') });
  if (!parsed.success) return { error: 'Missing user.' };

  const { promoteUserToAdmin, recordAuditLogEntry } = getContainer();
  const result = await promoteUserToAdmin.execute({ email: parsed.data.email });
  if (isErr(result)) return { error: 'User not found.' };

  await recordAuditLogEntry.execute({
    actorUserId: admin.id,
    actorEmail: admin.email,
    action: 'user.promoted',
    targetType: 'user',
    targetId: parsed.data.email,
  });

  revalidatePath('/admin/users');
  return { message: `${parsed.data.email} is now an admin.` };
}
