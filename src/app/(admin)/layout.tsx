import { cookies } from 'next/headers';

import { getSessionUser } from '@/app/lib/session';
import { AdminChrome } from './components/AdminChrome';
import { AdminAccountMenu } from './components/AdminAccountMenu';
import { NAV_OPEN_COOKIE } from './components/nav-state';

/**
 * Chrome only — the sidebar, the topbar, and the admin palette.
 *
 * Typefaces come from the root layout (`src/app/fonts/fonts.ts`), which
 * exposes them as `--ui-sans` / `--ui-mono`.
 *
 * Access control stays on the pages (`requireAdmin()`), not here: a layout
 * is not a security boundary in the App Router, since it doesn't re-run on
 * every client navigation into its subtree.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [user, cookieStore] = await Promise.all([getSessionUser(), cookies()]);
  // Open unless explicitly closed — an admin who has never touched it
  // should see the nav.
  const navOpen = cookieStore.get(NAV_OPEN_COOKIE)?.value !== '0';

  return (
    <AdminChrome
      defaultOpen={navOpen}
      accountMenu={
        user ? <AdminAccountMenu email={user.email} avatarUrl={user.avatarUrl} /> : null
      }
    >
      {children}
    </AdminChrome>
  );
}
