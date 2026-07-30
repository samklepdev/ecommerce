import Link from 'next/link';

import { ErrorScreen, errorScreenStyles as styles } from '@/components/errors/ErrorScreen';
import { env } from '@/config/env';

/** A missing page is not an error worth alarming anyone about, so this one
 * is quiet and points back at the catalogue. Server component, so it can
 * read the real support address rather than a public copy of it. */
export default function NotFound() {
  return (
    <ErrorScreen
      code="404"
      title="Page not found"
      supportEmail={env.SUPPORT_EMAIL}
      actions={
        <>
          <Link className={styles.button} href="/products">
            Browse the shop
          </Link>
          <Link className={styles.buttonQuiet} href="/orders/find">
            Find my order
          </Link>
        </>
      }
    >
      <p>
        That link doesn&apos;t go anywhere. It may have been a product that&apos;s no longer
        listed, or a mistyped address.
      </p>
    </ErrorScreen>
  );
}
