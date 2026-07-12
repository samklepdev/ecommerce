'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { env } from '@/config/env';
import { isErr } from '@/shared/domain/result';
import { getContainer } from '@/composition/container';
import { GUEST_SESSION_COOKIE, SESSION_COOKIE } from '@/app/lib/session';

const CredentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
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
  const parsed = CredentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { error: 'Enter a valid email and a password of at least 8 characters.' };
  }

  const { signUp } = getContainer();
  const result = await signUp.execute(parsed.data);
  if (isErr(result)) return { error: 'That email is already registered.' };

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
