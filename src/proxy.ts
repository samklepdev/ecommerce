import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';

const GUEST_SESSION_COOKIE = 'guest_session_id';
const GUEST_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const SESSION_COOKIE = 'session_id';

/**
 * Renamed from `middleware.ts` (Next 16 hard rename). Ensures every visitor
 * has a guest session id before any Server Component or Server Action runs,
 * so guest carts always have a stable Redis key.
 *
 * The `/admin` check here is optimistic (cookie presence only) — it's not the
 * real authorization boundary. Each admin page re-checks `role === 'admin'`
 * via GetCurrentUser, since proxy can't safely do a DB/Redis round trip for
 * every request the way a use case can.
 */
export function proxy(request: NextRequest): NextResponse {
  if (
    request.nextUrl.pathname.startsWith('/admin') &&
    !request.cookies.get(SESSION_COOKIE)
  ) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (request.cookies.get(GUEST_SESSION_COOKIE)) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  response.cookies.set(GUEST_SESSION_COOKIE, randomUUID(), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: GUEST_SESSION_TTL_SECONDS,
  });
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
