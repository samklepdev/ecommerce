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

const DemoteAdminSchema = z.object({
  email: z.string().email(),
});

export interface DemoteAdminActionResult {
  message?: string;
  error?: string;
}

export async function demoteAdminAction(
  _prevState: DemoteAdminActionResult | undefined,
  formData: FormData,
): Promise<DemoteAdminActionResult> {
  const admin = await requireAdmin();
  const parsed = DemoteAdminSchema.safeParse({ email: formData.get('email') });
  if (!parsed.success) return { error: 'Missing user.' };

  const { demoteAdmin, recordAuditLogEntry } = getContainer();
  const result = await demoteAdmin.execute({ email: parsed.data.email, actingUserId: admin.id });
  if (isErr(result)) {
    return {
      error:
        result.error.code === 'user_not_found'
          ? 'User not found.'
          : "You can't revoke your own admin access.",
    };
  }

  await recordAuditLogEntry.execute({
    actorUserId: admin.id,
    actorEmail: admin.email,
    action: 'user.demoted',
    targetType: 'user',
    targetId: parsed.data.email,
  });

  revalidatePath('/admin/users');
  return { message: `${parsed.data.email} is no longer an admin.` };
}
