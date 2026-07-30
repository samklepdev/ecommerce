'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { env } from '@/config/env';
import { isErr } from '@/shared/domain/result';
import { logger } from '@/shared/infrastructure/logger';
import { getContainer } from '@/composition/container';
import { isStoreOpen, STORE_CLOSED_MESSAGE } from '@/app/lib/store-open';
import { newPasswordSchema } from '@/app/lib/password-schema';
import { PASSWORD_RULE_TEXT } from '@/shared/domain/password-policy';
import { GUEST_SESSION_COOKIE, SESSION_COOKIE } from '@/app/lib/session';
import { checkRateLimit, getClientIp, tooManyAttemptsMessage } from '@/app/lib/rate-limit';
import { isHoneypotTripped } from '@/app/lib/honeypot';

/** Sign-in, not sign-up: the password policy is deliberately NOT applied
 * here. Accounts created under the old rule must still be able to log in,
 * and rejecting a password at the door tells an attacker which ones aren't
 * worth trying. */
const CredentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const SignUpSchema = z
  .object({
    email: z.string().email(),
    password: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

export interface AuthActionResult {
  error?: string;
}

/** What a non-admin sees while the store is closed: exactly what a wrong
 * password produces, and nothing else.
 *
 * Two reasons it's this and not "we're closed". It doesn't announce the
 * state of the business to anyone probing the login form; and it keeps the
 * response identical for a valid customer password and an invalid one, so a
 * closure can't be used to test which addresses have accounts. */
const CLOSED_SIGN_IN_REFUSAL = 'Invalid email or password.';

/** Logs in, sets the session cookie, and merges the pre-login guest cart.
 *
 * `adminOnly` is the closed-store case: credentials are still checked, but a
 * session is only *kept* for an admin. Anyone else gets the same message as a
 * wrong password would produce, so a closed store doesn't become an oracle
 * for which addresses have accounts. */
async function establishSession(
  email: string,
  password: string,
  adminOnly = false,
): Promise<AuthActionResult> {
  const { logIn, mergeGuestCart, getCurrentUser, logOut } = getContainer();
  const result = await logIn.execute({
    email,
    password,
    sessionTtlSeconds: env.SESSION_TTL_SECONDS,
    idleTimeoutSeconds: env.SESSION_IDLE_TIMEOUT_SECONDS,
    adminIdleTimeoutSeconds: env.ADMIN_SESSION_IDLE_TIMEOUT_SECONDS,
  });
  if (isErr(result)) return { error: 'Invalid email or password.' };

  if (adminOnly) {
    const user = await getCurrentUser.execute({ sessionId: result.value.id });
    if (user?.role !== 'admin') {
      // The session exists for a moment because the role lives behind it.
      // Revoked here rather than left to expire, and the cookie is never
      // set, so nothing usable reaches the browser.
      await logOut.execute({ sessionId: result.value.id });
      return { error: CLOSED_SIGN_IN_REFUSAL };
    }
  }

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
  // Silently discarded. A bot told it was caught is a bot that gets fixed;
  // and no real visitor can reach this branch, since the field is off-screen
  // and out of the accessibility tree.
  if (isHoneypotTripped(formData)) return { error: 'Could not create that account.' };

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
        : (parsed.error.issues.find((i) => i.path.includes('password'))?.message ??
          `Enter a valid email. ${PASSWORD_RULE_TEXT}`),
    };
  }

  // No new accounts while the shop is shut. Registration during a closure
  // creates rows and sends mail for someone who can't do anything yet, and
  // it's an open surface at exactly the time nobody is watching it.
  if (!(await isStoreOpen())) return { error: STORE_CLOSED_MESSAGE };

  const ip = await getClientIp();
  const signupLimit = await checkRateLimit(`signup:${ip}`, 3, 60 * 60);
  if (!signupLimit.allowed) return { error: tooManyAttemptsMessage(signupLimit.retryAfterSeconds) };

  const { signUp, jobQueue } = getContainer();
  const result = await signUp.execute(parsed.data);
  if (isErr(result)) return { error: 'That email is already registered.' };

  // Both queued: signing up should not wait on a mail provider, and a
  // verification link that fails to send now gets retried rather than lost.
  for (const job of ['email.welcome', 'email.verification'] as const) {
    try {
      await jobQueue.enqueue(
        job,
        { userId: result.value.id, email: result.value.email },
        { jobId: `${job.replace('.', '-')}-${result.value.id}` },
      );
    } catch (e) {
      logger.error('signup: could not queue mail', {
        job,
        error: e instanceof Error ? e.message : String(e),
      });
    }
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

  // While the store is closed, only admins may sign in — the console has to
  // stay reachable, and everything a customer would sign in *for* is paused
  // anyway. Existing customer sessions aren't revoked; every page they can
  // reach already shows the paused notice.
  const adminOnly = !(await isStoreOpen());

  const result = await establishSession(parsed.data.email, parsed.data.password, adminOnly);
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
  // Paused with sign-up: this one sends mail, and a closure is exactly when
  // you don't want reset links going out unattended. `resetPasswordAction`
  // and `verifyEmailAction` stay open — they complete a flow someone was
  // already sent a link for, and those tokens expire.
  if (!(await isStoreOpen())) return { error: STORE_CLOSED_MESSAGE };

  const parsed = RequestPasswordResetSchema.safeParse({ email: formData.get('email') });
  if (!parsed.success) return { error: 'Enter a valid email address.' };

  const ip = await getClientIp();
  const limit = await checkRateLimit(`password-reset:${ip}:${parsed.data.email}`, 3, 60 * 60);
  if (!limit.allowed) return { error: tooManyAttemptsMessage(limit.retryAfterSeconds) };

  const { requestPasswordReset } = getContainer();
  try {
    await requestPasswordReset.execute({ email: parsed.data.email });
  } catch (e) {
    // A real provider can reject a send; an error page here would leak that
    // the address exists, which is the one thing this flow must never do.
    // Same message either way, and the failure goes to the logs.
    logger.warn('password reset: email failed', {
      error: e instanceof Error ? e.message : String(e),
    });
  }

  return { message: 'If that email is registered, a reset link has been sent.' };
}

const ResetPasswordSchema = z
  .object({
    token: z.string().min(1),
    newPassword: newPasswordSchema,
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
        : (parsed.error.issues.find((i) => i.path.includes('newPassword'))?.message ??
          PASSWORD_RULE_TEXT),
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

const VerifyEmailSchema = z.object({
  token: z.string().min(1),
});

export interface VerifyEmailActionResult {
  error?: string;
}

export async function verifyEmailAction(
  _prevState: VerifyEmailActionResult | undefined,
  formData: FormData,
): Promise<VerifyEmailActionResult> {
  const parsed = VerifyEmailSchema.safeParse({ token: formData.get('token') });
  if (!parsed.success) return { error: 'Missing verification token.' };

  const { verifyEmail } = getContainer();
  const result = await verifyEmail.execute({ token: parsed.data.token });
  if (isErr(result)) {
    return { error: 'This verification link is invalid or has expired. Request a new one from your account page.' };
  }

  redirect('/account?verified=success');
}
