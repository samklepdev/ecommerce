'use client';

import { useEffect } from 'react';

import { ErrorScreen, errorScreenStyles as styles } from '@/components/errors/ErrorScreen';
import './globals.css';

/**
 * The last resort: an error in the root layout itself, where nothing else
 * of ours has rendered.
 *
 * It has to supply `<html>` and `<body>`, because it replaces the root
 * layout rather than nesting inside it — which is also why `ErrorScreen`
 * carries its own colours instead of trusting a palette from an ancestor
 * that never ran.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[global-error]', error.digest ?? '(no digest)');
  }, [error]);

  return (
    <html lang="en">
      <body>
        <ErrorScreen
          code="Error"
          title="The shop is having a moment"
          reference={error.digest ?? null}
          supportEmail={process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'support@storefront.example'}
          actions={
            <button type="button" className={styles.button} onClick={reset}>
              Try again
            </button>
          }
        >
          <p>
            Something failed before the page could load. Any order you have already placed is
            safe, and no payment is affected.
          </p>
        </ErrorScreen>
      </body>
    </html>
  );
}
