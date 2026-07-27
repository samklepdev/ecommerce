import { logOutAction } from '@/app/actions/auth';
import { Avatar } from '@/components/ui/Avatar';
import { Dropdown, DropdownDivider, DropdownItem } from '@/components/ui/Dropdown';
import styles from './AdminAccountMenu.module.css';

interface AdminAccountMenuProps {
  email: string;
  avatarUrl: string | null;
}

/** The admin's own account, not the admin nav — everything an admin
 * *manages* is in the sidebar; this is only what they do as a signed-in
 * person. */
export function AdminAccountMenu({ email, avatarUrl }: AdminAccountMenuProps) {
  return (
    <Dropdown
      align="right"
      triggerClassName={styles.trigger}
      trigger={
        <span className={styles.identity}>
          <Avatar avatarUrl={avatarUrl} label={email} size="sm" />
          <span className={styles.email}>{email}</span>
        </span>
      }
    >
      <DropdownItem href="/account">Account</DropdownItem>
      <DropdownItem href="/">Storefront</DropdownItem>
      <DropdownDivider />
      <form action={logOutAction}>
        <DropdownItem type="submit">Log out</DropdownItem>
      </form>
    </Dropdown>
  );
}
