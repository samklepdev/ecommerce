'use server';

import { cookies } from 'next/headers';

import { getContainer } from '@/composition/container';
import { isErr } from '@/shared/domain/result';
import { requireAdmin, SESSION_COOKIE } from '@/app/lib/session';
import { checkRateLimit, tooManyAttemptsMessage } from '@/app/lib/rate-limit';

export interface ReauthActionResult {
  ok?: boolean;
  error?: string;
}

/**
 * "Type your password again" — the sudo-mode gate for destructive admin
 * actions.
 *
 * Rate limited like the login form, because it is one: it verifies a
 * password, and an unthrottled endpoint that does that is a place to guess
 * them. Keyed on the account rather than the IP, since the account is known
 * here and is what's under attack.
 */
export async function confirmAdminPasswordAction(
  _prevState: ReauthActionResult | undefined,
  formData: FormData,
): Promise<ReauthActionResult> {
  const admin = await requireAdmin();

  const password = String(formData.get('password') ?? '');
  if (!password) return { error: 'Enter your password.' };

  const limit = await checkRateLimit(`reauth:${admin.id}`, 5, 15 * 60);
  if (!limit.allowed) return { error: tooManyAttemptsMessage(limit.retryAfterSeconds) };

  const sessionId = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!sessionId) return { error: 'Your session has expired — sign in again.' };

  const { reauthenticate } = getContainer();
  const result = await reauthenticate.execute({ sessionId, password });

  if (isErr(result)) {
    return {
      error:
        result.error.code === 'invalid_password'
          ? 'That password is not correct.'
          : 'Your session has expired — sign in again.',
    };
  }

  // Deliberately no revalidatePath: nothing on the page changed. The caller
  // simply retries the action it was blocked on.
  return { ok: true };
}
