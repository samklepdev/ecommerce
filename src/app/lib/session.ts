import { cookies } from 'next/headers';

import { getContainer } from '@/composition/container';
import type { CartOwner } from '@/modules/cart/domain/cart';
import type { User } from '@/modules/identity/domain/user';

export const GUEST_SESSION_COOKIE = 'guest_session_id';
export const SESSION_COOKIE = 'session_id';

export async function getSessionUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value ?? null;
  const { getCurrentUser } = getContainer();
  return getCurrentUser.execute({ sessionId });
}

/** Resolves the cart owner for the current request: logged-in user if the
 * session cookie is valid, otherwise the guest session id set by proxy.ts. */
export async function resolveCartOwner(): Promise<CartOwner> {
  const user = await getSessionUser();
  if (user) return { type: 'user', userId: user.id };

  const cookieStore = await cookies();
  const guestSessionId = cookieStore.get(GUEST_SESSION_COOKIE)?.value ?? '';
  return { type: 'guest', sessionId: guestSessionId };
}

/**
 * The real authorization boundary for admin surfaces — proxy.ts only checks
 * cookie presence. Throws if the caller isn't an authenticated admin, so
 * callers (pages, actions) fail closed rather than silently no-op.
 */
export async function requireAdmin(): Promise<User> {
  const user = await getSessionUser();
  if (!user || !user.isAdmin) {
    throw new Error('Admin access required');
  }
  return user;
}

/** Same fail-closed shape as `requireAdmin`, for actions that just need any
 * logged-in user (e.g. account settings) rather than an admin. Pages that
 * need this should call `getSessionUser()` + `redirect('/login')` directly
 * instead, since a thrown error isn't the right UX for a normal page visit. */
export async function requireUser(): Promise<User> {
  const user = await getSessionUser();
  if (!user) {
    throw new Error('Login required');
  }
  return user;
}
