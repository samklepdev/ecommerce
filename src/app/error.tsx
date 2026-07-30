'use client';

import { useEffect } from 'react';
import Link from 'next/link';

import { ErrorScreen, errorScreenStyles as styles } from '@/components/errors/ErrorScreen';

/**
 * Catches render errors anywhere below the root layout.
 *
 * Deliberately does not say what went wrong. The message on a server error
 * routinely contains a query, a path, or a connection string, and this page
 * is shown to whoever hit it. The digest is the safe half: Next logs the
 * full error server-side under the same id, so support can join the two.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Same stream as everything else, and the only client-side record that
    // this screen was ever shown. Never the message — see above.
    console.error('[app-error]', error.digest ?? '(no digest)');
  }, [error]);

  return (
    <ErrorScreen
      code="Error"
      title="Something went wrong"
      reference={error.digest ?? null}
      supportEmail={process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'support@storefront.example'}
      actions={
        <>
          <button type="button" className={styles.button} onClick={reset}>
            Try again
          </button>
          <Link className={styles.buttonQuiet} href="/">
            Back to the shop
          </Link>
        </>
      }
    >
      <p>
        This page didn&apos;t load. Nothing you were doing has been lost — any order you have
        already placed is safe, and no payment is affected.
      </p>
    </ErrorScreen>
  );
}
