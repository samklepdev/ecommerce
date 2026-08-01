import { randomUUID } from 'node:crypto';

import { cookies } from 'next/headers';

import { env } from '@/config/env';
import { REAUTH_REQUIRED } from '@/app/lib/session-constants';
import { getContainer } from '@/composition/container';
import type { CartOwner } from '@/modules/cart/domain/cart';
import type { User } from '@/modules/identity/domain/user';

export const GUEST_SESSION_COOKIE = 'guest_session_id';
export const SESSION_COOKIE = 'session_id';
/** Mirrors proxy.ts — the cookie is normally minted there, and only re-set
 * here when a request somehow arrived without one. */
const GUEST_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

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
  const existing = cookieStore.get(GUEST_SESSION_COOKIE)?.value;
  if (existing) return { type: 'guest', sessionId: existing };

  // No cookie: proxy.ts should have set one, but anything that slips past it
  // (an excluded path, a client that drops cookies) must still get its OWN
  // cart. The old fallback was an empty string, which every such visitor
  // shared as the single Redis key `cart:guest:` — strangers reading and
  // editing one another's carts.
  const sessionId = randomUUID();
  try {
    cookieStore.set(GUEST_SESSION_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: GUEST_SESSION_TTL_SECONDS,
    });
  } catch {
    // Server Components can't set cookies — only Actions and Route Handlers
    // can. The id is then ephemeral: this render gets an empty cart of its
    // own rather than somebody else's, and the next mutation persists one.
  }
  return { type: 'guest', sessionId };
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

export { REAUTH_REQUIRED } from '@/app/lib/session-constants';

/**
 * Admin *and* recently re-authenticated.
 *
 * `requireAdmin` proves who holds the session; this proves someone who knows
 * the password is at the keyboard right now. The difference matters for the
 * handful of actions that move money or destroy data — an unlocked laptop
 * should be able to read the console without being able to cancel a paid order
 * or delete the catalogue.
 *
 * Returns a discriminated result rather than throwing, because "type your
 * password again" is a normal prompt, not an error.
 */
export async function requireRecentAdminAuth(): Promise<
  { ok: true; admin: User } | { ok: false; reason: typeof REAUTH_REQUIRED }
> {
  const admin = await requireAdmin();

  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value ?? null;
  if (!sessionId) return { ok: false, reason: REAUTH_REQUIRED };

  const { sessions } = getContainer();
  const session = await sessions.get(sessionId);
  if (!session || !session.hasRecentAuthAt(env.ADMIN_REAUTH_WINDOW_SECONDS)) {
    return { ok: false, reason: REAUTH_REQUIRED };
  }

  return { ok: true, admin };
}
