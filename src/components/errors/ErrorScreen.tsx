import type { ReactNode } from 'react';

import styles from './ErrorScreen.module.css';

export interface ErrorScreenProps {
  /** Small uppercase label above the heading, e.g. "404" or "Error". */
  code: string;
  title: string;
  children: ReactNode;
  /** Next's error digest, or an order id — anything worth quoting to
   * support. Rendered `user-select: all` so one click copies it. */
  reference?: string | null;
  actions?: ReactNode;
  supportEmail: string;
}

/**
 * The shape every error screen shares.
 *
 * Styled with literal colours rather than the storefront's CSS variables on
 * purpose. `global-error.tsx` replaces the root layout — including `<html>`
 * — so nothing above it is guaranteed to have run: no palette, no theme
 * scope, possibly no font variables. A screen that renders unstyled at the
 * moment something has already gone wrong is its own small failure, so
 * these carry their own colours and degrade to system fonts.
 *
 * `supportEmail` is passed in rather than read from `env` here, because
 * `global-error.tsx` is a client component and must not pull server config
 * into the bundle.
 */
export function ErrorScreen({
  code,
  title,
  children,
  reference,
  actions,
  supportEmail,
}: ErrorScreenProps) {
  return (
    <div className={styles.root}>
      <div className={styles.panel}>
        <span className={styles.mark} aria-hidden="true" />
        <p className={styles.code}>{code}</p>
        <h1 className={styles.title}>{title}</h1>
        <div className={styles.body}>{children}</div>

        {reference && (
          <p className={styles.reference} title="Quote this to support">
            {reference}
          </p>
        )}

        {actions && <div className={styles.actions}>{actions}</div>}

        <p className={styles.note}>
          Need a hand? Email <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
          {reference ? ' and include the reference above.' : '.'}
        </p>
      </div>
    </div>
  );
}

export { styles as errorScreenStyles };
