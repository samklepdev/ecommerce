import type { ReactNode } from 'react';

import { cx } from './cx';
import styles from './Card.module.css';

interface CardProps {
  children: ReactNode;
  /** Renders a titled header rule. Without it the card is a bare well, as
   * it has always been — every existing caller keeps working unchanged. */
  title?: string;
  /** Right side of the header: a link, an export, a menu. */
  actions?: ReactNode;
  footer?: ReactNode;
  /** `false` lets a table or chart run edge to edge. */
  padded?: boolean;
  className?: string;
}

/** A bordered surface. Title, actions and footer are all optional, so the
 * same component serves a chart, a table and a plain content well. */
export function Card({
  children,
  title,
  actions,
  footer,
  padded = true,
  className,
}: CardProps) {
  const hasHeader = Boolean(title || actions);

  return (
    <section className={cx(styles.card, className)}>
      {hasHeader && (
        <header className={styles.head}>
          {title && <h3 className={styles.title}>{title}</h3>}
          {actions && <div className={styles.actions}>{actions}</div>}
        </header>
      )}
      {/* Unwrapped when there's no header or footer, so the plain case keeps
          the exact box model callers already lay out against. */}
      {hasHeader || footer ? (
        <div className={padded ? styles.body : styles.bodyFlush}>{children}</div>
      ) : (
        children
      )}
      {footer && <footer className={styles.foot}>{footer}</footer>}
    </section>
  );
}
