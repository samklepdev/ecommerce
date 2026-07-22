'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { logger } from '@/shared/infrastructure/logger';
import { isErr } from '@/shared/domain/result';
import { getContainer } from '@/composition/container';
import { requireUser, SESSION_COOKIE } from '@/app/lib/session';

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

export interface ResendVerificationActionResult {
  message?: string;
  error?: string;
}

export async function resendVerificationAction(): Promise<ResendVerificationActionResult> {
  const user = await requireUser();
  if (user.isEmailVerified) return { message: 'Your email is already verified.' };

  const { requestEmailVerification } = getContainer();
  try {
    await requestEmailVerification.execute({ userId: user.id, email: user.email });
  } catch (e) {
    logger.warn('resend-verification: failed', { error: e instanceof Error ? e.message : String(e) });
    return { error: 'Could not send the verification email. Try again shortly.' };
  }

  return { message: 'Verification email sent.' };
}

const ChangeEmailSchema = z.object({
  newEmail: z.string().email(),
  currentPassword: z.string().min(1),
});

export interface ChangeEmailActionResult {
  message?: string;
  error?: string;
}

export async function changeEmailAction(
  _prevState: ChangeEmailActionResult | undefined,
  formData: FormData,
): Promise<ChangeEmailActionResult> {
  const user = await requireUser();
  const parsed = ChangeEmailSchema.safeParse({
    newEmail: formData.get('newEmail'),
    currentPassword: formData.get('currentPassword'),
  });
  if (!parsed.success) return { error: 'Enter a valid email and your current password.' };

  const { changeEmail, requestEmailVerification } = getContainer();
  const result = await changeEmail.execute({
    userId: user.id,
    newEmail: parsed.data.newEmail,
    currentPassword: parsed.data.currentPassword,
  });
  if (isErr(result)) {
    const messages: Record<typeof result.error.code, string> = {
      invalid_current_password: 'Current password is incorrect.',
      email_taken: 'That email is already in use.',
      user_not_found: 'Could not change email.',
    };
    return { error: messages[result.error.code] };
  }

  try {
    await requestEmailVerification.execute({ userId: user.id, email: parsed.data.newEmail });
  } catch (e) {
    logger.warn('change-email: verification email failed', {
      error: e instanceof Error ? e.message : String(e),
    });
  }

  revalidatePath('/account');
  return { message: 'Email changed. Check your new address for a verification link.' };
}

const DeleteAccountSchema = z.object({
  currentPassword: z.string().min(1),
});

export interface DeleteAccountActionResult {
  error?: string;
}

export async function deleteAccountAction(
  _prevState: DeleteAccountActionResult | undefined,
  formData: FormData,
): Promise<DeleteAccountActionResult> {
  const user = await requireUser();
  const parsed = DeleteAccountSchema.safeParse({ currentPassword: formData.get('currentPassword') });
  if (!parsed.success) return { error: 'Enter your current password.' };

  const { deleteAccount, logOut } = getContainer();
  const result = await deleteAccount.execute({
    userId: user.id,
    currentPassword: parsed.data.currentPassword,
  });
  if (isErr(result)) {
    return {
      error:
        result.error.code === 'invalid_current_password'
          ? 'Current password is incorrect.'
          : 'Could not delete account.',
    };
  }

  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (sessionId) await logOut.execute({ sessionId });
  cookieStore.delete(SESSION_COOKIE);

  redirect('/');
}
