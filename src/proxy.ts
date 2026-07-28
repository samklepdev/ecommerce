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

  // Pass the resolved pathname through as a request header — Server
  // Components have no other way to read the current route (no
  // usePathname equivalent), and page-view analytics needs it. Pure
  // in-memory header set, no DB/Redis I/O, so it doesn't add a round trip
  // here.
  // Mint the guest session id onto the REQUEST, not just the response.
  // Server Components and Server Actions read cookies off the incoming
  // request, so a response-only cookie leaves this first request with no id
  // at all — and an empty id used to build the cart key `cart:guest:`, one
  // key shared by every visitor who hadn't been here before.
  const isNewGuestSession = !request.cookies.get(GUEST_SESSION_COOKIE);
  const guestSessionId = request.cookies.get(GUEST_SESSION_COOKIE)?.value ?? randomUUID();
  if (isNewGuestSession) {
    request.cookies.set(GUEST_SESSION_COOKIE, guestSessionId);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', request.nextUrl.pathname);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  if (isNewGuestSession) {
    response.cookies.set(GUEST_SESSION_COOKIE, guestSessionId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: GUEST_SESSION_TTL_SECONDS,
    });
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
