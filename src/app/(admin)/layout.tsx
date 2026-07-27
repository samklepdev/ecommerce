import { getSessionUser } from '@/app/lib/session';
import { AdminChrome } from './components/AdminChrome';
import { AdminAccountMenu } from './components/AdminAccountMenu';

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
  const user = await getSessionUser();

  return (
    <AdminChrome
      accountMenu={
        user ? <AdminAccountMenu email={user.email} avatarUrl={user.avatarUrl} /> : null
      }
    >
      {children}
    </AdminChrome>
  );
}
