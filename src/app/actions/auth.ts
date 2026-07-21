'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { env } from '@/config/env';
import { isErr } from '@/shared/domain/result';
import { logger } from '@/shared/infrastructure/logger';
import { getContainer } from '@/composition/container';
import { GUEST_SESSION_COOKIE, SESSION_COOKIE } from '@/app/lib/session';
import { checkRateLimit, getClientIp, tooManyAttemptsMessage } from '@/app/lib/rate-limit';

const CredentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const SignUpSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(8),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

export interface AuthActionResult {
  error?: string;
}

/** Logs in, sets the session cookie, and merges the pre-login guest cart. */
async function establishSession(email: string, password: string): Promise<AuthActionResult> {
  const { logIn, mergeGuestCart } = getContainer();
  const result = await logIn.execute({
    email,
    password,
    sessionTtlSeconds: env.SESSION_TTL_SECONDS,
  });
  if (isErr(result)) return { error: 'Invalid email or password.' };

  const cookieStore = await cookies();
  const guestSessionId = cookieStore.get(GUEST_SESSION_COOKIE)?.value;

  cookieStore.set(SESSION_COOKIE, result.value.id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: env.SESSION_TTL_SECONDS,
  });

  if (guestSessionId) {
    await mergeGuestCart.execute({ guestSessionId, userId: result.value.userId });
  }

  return {};
}

export async function signUpAction(
  _prevState: AuthActionResult | undefined,
  formData: FormData,
): Promise<AuthActionResult> {
  const parsed = SignUpSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  });
  if (!parsed.success) {
    const mismatch = parsed.error.issues.some((issue) => issue.path.includes('confirmPassword'));
    return {
      error: mismatch
        ? 'Passwords do not match.'
        : 'Enter a valid email and a password of at least 8 characters.',
    };
  }

  const ip = await getClientIp();
  const signupLimit = await checkRateLimit(`signup:${ip}`, 3, 60 * 60);
  if (!signupLimit.allowed) return { error: tooManyAttemptsMessage(signupLimit.retryAfterSeconds) };

  const { signUp, sendWelcomeEmail } = getContainer();
  const result = await signUp.execute(parsed.data);
  if (isErr(result)) return { error: 'That email is already registered.' };

  try {
    await sendWelcomeEmail.execute({ userId: result.value.id, email: result.value.email });
  } catch (e) {
    logger.warn('signup: welcome email failed', {
      error: e instanceof Error ? e.message : String(e),
    });
  }

  const sessionResult = await establishSession(parsed.data.email, parsed.data.password);
  if (sessionResult.error) return sessionResult;

  redirect('/');
}

export async function logInAction(
  _prevState: AuthActionResult | undefined,
  formData: FormData,
): Promise<AuthActionResult> {
  const parsed = CredentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) return { error: 'Enter a valid email and password.' };

  const ip = await getClientIp();

  // Two independent layers: one caps hammering a single victim account from
  // one IP (keyed on IP+email), the other catches one IP sweeping many
  // different emails (keyed on IP alone) — neither replaces the other.
  const perIpLimit = await checkRateLimit(`login-ip:${ip}`, 20, 15 * 60);
  if (!perIpLimit.allowed) return { error: tooManyAttemptsMessage(perIpLimit.retryAfterSeconds) };

  const perAccountLimit = await checkRateLimit(`login:${ip}:${parsed.data.email}`, 5, 15 * 60);
  if (!perAccountLimit.allowed) {
    return { error: tooManyAttemptsMessage(perAccountLimit.retryAfterSeconds) };
  }

  const result = await establishSession(parsed.data.email, parsed.data.password);
  if (result.error) return result;

  redirect('/');
}

export async function logOutAction(): Promise<void> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (sessionId) {
    const { logOut } = getContainer();
    await logOut.execute({ sessionId });
  }
  cookieStore.delete(SESSION_COOKIE);
  redirect('/');
}

const RequestPasswordResetSchema = z.object({
  email: z.string().email(),
});

export interface RequestPasswordResetActionResult {
  message?: string;
  error?: string;
}

/** Always returns the same success message regardless of whether the email
 * belongs to a real account — this is the point, not an oversight (see
 * RequestPasswordReset's own doc comment). */
export async function requestPasswordResetAction(
  _prevState: RequestPasswordResetActionResult | undefined,
  formData: FormData,
): Promise<RequestPasswordResetActionResult> {
  const parsed = RequestPasswordResetSchema.safeParse({ email: formData.get('email') });
  if (!parsed.success) return { error: 'Enter a valid email address.' };

  const ip = await getClientIp();
  const limit = await checkRateLimit(`password-reset:${ip}:${parsed.data.email}`, 3, 60 * 60);
  if (!limit.allowed) return { error: tooManyAttemptsMessage(limit.retryAfterSeconds) };

  const { requestPasswordReset } = getContainer();
  await requestPasswordReset.execute({ email: parsed.data.email });

  return { message: 'If that email is registered, a reset link has been sent.' };
}

const ResetPasswordSchema = z
  .object({
    token: z.string().min(1),
    newPassword: z.string().min(8),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

export interface ResetPasswordActionResult {
  error?: string;
}

export async function resetPasswordAction(
  _prevState: ResetPasswordActionResult | undefined,
  formData: FormData,
): Promise<ResetPasswordActionResult> {
  const parsed = ResetPasswordSchema.safeParse({
    token: formData.get('token'),
    newPassword: formData.get('newPassword'),
    confirmPassword: formData.get('confirmPassword'),
  });
  if (!parsed.success) {
    const mismatch = parsed.error.issues.some((issue) => issue.path.includes('confirmPassword'));
    return {
      error: mismatch
        ? 'Passwords do not match.'
        : 'Enter a new password of at least 8 characters.',
    };
  }

  const { resetPassword } = getContainer();
  const result = await resetPassword.execute({
    token: parsed.data.token,
    newPassword: parsed.data.newPassword,
  });
  if (isErr(result)) {
    return { error: 'This reset link is invalid or has expired. Request a new one.' };
  }

  redirect('/login?reset=success');
}
