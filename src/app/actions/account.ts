'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { isErr } from '@/shared/domain/result';
import { getContainer } from '@/composition/container';
import { requireUser } from '@/app/lib/session';

const MAX_AVATAR_BYTES = 8 * 1024 * 1024;

const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'New passwords do not match.',
    path: ['confirmPassword'],
  });

export interface ChangePasswordActionResult {
  message?: string;
  error?: string;
}

export async function changePasswordAction(
  _prevState: ChangePasswordActionResult | undefined,
  formData: FormData,
): Promise<ChangePasswordActionResult> {
  const user = await requireUser();
  const parsed = ChangePasswordSchema.safeParse({
    currentPassword: formData.get('currentPassword'),
    newPassword: formData.get('newPassword'),
    confirmPassword: formData.get('confirmPassword'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Enter your current and a new password.' };
  }

  const { changePassword } = getContainer();
  const result = await changePassword.execute({
    userId: user.id,
    currentPassword: parsed.data.currentPassword,
    newPassword: parsed.data.newPassword,
  });
  if (isErr(result)) {
    return {
      error:
        result.error.code === 'invalid_current_password'
          ? 'Current password is incorrect.'
          : 'Could not change password.',
    };
  }

  revalidatePath('/account');
  return { message: 'Password changed.' };
}

const UpdateAvatarSchema = z.object({
  avatar: z
    .instanceof(File)
    .refine((f) => f.size > 0, 'Choose an image file.')
    .refine((f) => f.size <= MAX_AVATAR_BYTES, 'The image must be 8MB or smaller.'),
});

export interface UpdateAvatarActionResult {
  message?: string;
  error?: string;
}

export async function updateAvatarAction(
  _prevState: UpdateAvatarActionResult | undefined,
  formData: FormData,
): Promise<UpdateAvatarActionResult> {
  const user = await requireUser();
  const avatar = formData.get('avatar');
  const parsed = UpdateAvatarSchema.safeParse({
    avatar: avatar instanceof File && avatar.size > 0 ? avatar : undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Choose an image file.' };
  }

  const { updateAvatar } = getContainer();
  const buffer = Buffer.from(await parsed.data.avatar.arrayBuffer());
  const result = await updateAvatar.execute({
    userId: user.id,
    buffer,
    contentType: parsed.data.avatar.type,
  });
  if (!result.url) {
    return { error: 'Unrecognized image type — use JPEG, PNG, WebP, or GIF.' };
  }

  revalidatePath('/account');
  revalidatePath('/');
  return { message: 'Avatar updated.' };
}
