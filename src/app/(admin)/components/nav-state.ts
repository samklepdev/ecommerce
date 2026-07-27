/** Name of the cookie holding whether the sidebar is open.
 *
 * A cookie rather than localStorage so the layout can read it on the server
 * and render the correct state in the first paint. Reading localStorage
 * would mean always painting it open and snapping shut after hydration. */
export const NAV_OPEN_COOKIE = 'admin_nav_open';

/** Preference only — no security value, so `SameSite=Lax` and a plain path
 * are enough. Persisted for a year; it's a UI setting, not a session. */
export function navOpenCookie(open: boolean): string {
  return `${NAV_OPEN_COOKIE}=${open ? '1' : '0'}; path=/; max-age=31536000; samesite=lax`;
}
