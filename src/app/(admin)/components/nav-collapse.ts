/** Name of the cookie holding the rail's collapsed state.
 *
 * A cookie rather than localStorage so the layout can read it on the server
 * and render the correct width in the first paint. Reading localStorage
 * would mean starting expanded and snapping shut after hydration. */
export const NAV_COLLAPSED_COOKIE = 'admin_nav_collapsed';

/** Preference only — no security value, so `SameSite=Lax` and a plain path
 * are enough. Persisted for a year; it's a UI setting, not a session. */
export function navCollapsedCookie(collapsed: boolean): string {
  return `${NAV_COLLAPSED_COOKIE}=${collapsed ? '1' : '0'}; path=/; max-age=31536000; samesite=lax`;
}
