import { cookies } from 'next/headers';
import Link from 'next/link';

import { getContainer } from '@/composition/container';
import { GUEST_SESSION_COOKIE, getSessionUser } from '@/app/lib/session';
import { logOutAction } from '@/app/actions/auth';
import type { CartOwner } from '@/modules/cart/domain/cart';
import { Dropdown, DropdownDivider, DropdownItem } from '@/components/ui/Dropdown';
import { Avatar } from '@/components/ui/Avatar';
import { AdminStrip } from './AdminStrip';
import { StorefrontNav, type NavLink } from './StorefrontNav';
import { cx } from '@/components/ui/cx';
import styles from './Header.module.css';

/** Only destinations that exist. The prototype also listed /about/payments
 * and /about/self-custody; neither route is built, and a nav link to a 404
 * is worse than no link. Add them here when those pages land. */
const NAV: NavLink[] = [{ label: 'Products', href: '/products' }];

function CartIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={styles.icon}
      aria-hidden="true"
    >
      <path d="M2 3h2.2l1.8 9.2a1.4 1.4 0 001.4 1.1h7.2a1.4 1.4 0 001.4-1.1L17.4 6H5.2" />
      <circle cx="8" cy="17" r="1.1" />
      <circle cx="15" cy="17" r="1.1" />
    </svg>
  );
}

export async function Header() {
  const user = await getSessionUser();

  const owner: CartOwner = user
    ? { type: 'user', userId: user.id }
    : { type: 'guest', sessionId: (await cookies()).get(GUEST_SESSION_COOKIE)?.value ?? '' };

  const { getCart } = getContainer();
  const cart = await getCart.execute({ owner });
  const itemCount = cart?.lines.reduce((sum, l) => sum + l.quantity, 0) ?? 0;

  // The same links the desktop dropdown holds, handed to the drawer so the
  // two never drift apart.
  const accountLinks = user ? (
    <>
      <span className={styles.drawerEmail}>{user.email}</span>
      <Link href="/account">Account</Link>
      <Link href="/account/orders">My orders</Link>
      <Link href="/account/wishlist">Saved products</Link>
      {user.isAdmin && <Link href="/admin">Admin console</Link>}
      <form action={logOutAction}>
        <button type="submit" className={styles.drawerLogout}>
          Log out
        </button>
      </form>
    </>
  ) : (
    <Link href="/login">Log in</Link>
  );

  return (
    <>
      {user?.isAdmin && <AdminStrip />}

      <header className={styles.header}>
        <div className={styles.inner}>
          <Link href="/" className={styles.brand}>
            <span className={styles.brandMark} aria-hidden="true" />
            <span className={styles.brandName}>Storefront</span>
          </Link>

          <StorefrontNav links={NAV} itemCount={itemCount} drawerAccount={accountLinks} />

          <div className={styles.right}>
            <Link
              href="/cart"
              className={styles.cartLink}
              aria-label={`Cart, ${itemCount} ${itemCount === 1 ? 'item' : 'items'}`}
            >
              <CartIcon />
              <span className={styles.cartText}>Cart</span>
              {itemCount > 0 && <span className={styles.cartBadge}>{itemCount}</span>}
            </Link>

            {user ? (
              <Dropdown
                align="right"
                className={styles.accountMenu}
                trigger={<Avatar avatarUrl={user.avatarUrl} label={user.email} size="sm" />}
              >
                <span className={styles.ddEmail}>{user.email}</span>
                <DropdownDivider />
                <DropdownItem href="/account">Account</DropdownItem>
                <DropdownItem href="/account/orders">My orders</DropdownItem>
                <DropdownItem href="/account/wishlist">Saved products</DropdownItem>
                {user.isAdmin && (
                  <>
                    <DropdownDivider />
                    <DropdownItem href="/admin">Admin console</DropdownItem>
                  </>
                )}
                <DropdownDivider />
                <form action={logOutAction}>
                  <DropdownItem type="submit">Log out</DropdownItem>
                </form>
              </Dropdown>
            ) : (
              <Link href="/login" className={cx(styles.loginLink, styles.accountMenu)}>
                Log in
              </Link>
            )}
          </div>
        </div>
      </header>
    </>
  );
}
