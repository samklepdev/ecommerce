import { cookies } from 'next/headers';
import Link from 'next/link';

import { getContainer } from '@/composition/container';
import { GUEST_SESSION_COOKIE, getSessionUser } from '@/app/lib/session';
import { logOutAction } from '@/app/actions/auth';
import type { CartOwner } from '@/modules/cart/domain/cart';
import { Dropdown, DropdownItem, DropdownDivider } from '@/components/ui/Dropdown';
import { Avatar } from '@/components/ui/Avatar';
import styles from './Header.module.css';

export async function Header() {
  const user = await getSessionUser();

  const owner: CartOwner = user
    ? { type: 'user', userId: user.id }
    : { type: 'guest', sessionId: (await cookies()).get(GUEST_SESSION_COOKIE)?.value ?? '' };

  const { getCart } = getContainer();
  const cart = await getCart.execute({ owner });
  const itemCount = cart?.lines.reduce((sum, l) => sum + l.quantity, 0) ?? 0;

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand}>
          Storefront
        </Link>

        <nav className={styles.nav}>
          <Link href="/products">Products</Link>
          <Link href="/cart" className={styles.cartLink}>
            Cart
            {itemCount > 0 && <span className={styles.badge}>{itemCount}</span>}
          </Link>
          {user ? (
            <Dropdown
              trigger={<Avatar avatarUrl={user.avatarUrl} label={user.email} size="sm" />}
              align="right"
            >
              <DropdownItem href="/account">Account</DropdownItem>
              <DropdownItem href="/account/orders">Orders</DropdownItem>
              {user.isAdmin && (
                <>
                  <DropdownDivider />
                  <DropdownItem href="/admin/products">Products</DropdownItem>
                  <DropdownItem href="/admin/fulfillment">Fulfillment</DropdownItem>
                </>
              )}
              <DropdownDivider />
              <form action={logOutAction}>
                <DropdownItem type="submit">Log out</DropdownItem>
              </form>
            </Dropdown>
          ) : (
            <Link href="/login">Log in</Link>
          )}
        </nav>
      </div>
    </header>
  );
}
