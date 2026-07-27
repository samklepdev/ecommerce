import type { ReactNode } from 'react';

import styles from './SectionHeader.module.css';

interface SectionHeaderProps {
  title: string;
  /** One line on what the section shows, when the title alone is ambiguous. */
  description?: string;
  /** Right-aligned control — usually a drill-down link or an export. */
  action?: ReactNode;
}

/** A titled rule above a section. Replaces the header row that was being
 * hand-rolled in every analytics and storefront page. */
export function SectionHeader({ title, description, action }: SectionHeaderProps) {
  return (
    <div className={styles.header}>
      <div className={styles.text}>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
