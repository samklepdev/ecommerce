import Link from 'next/link';

import styles from './FlaggedOrdersAlert.module.css';

export interface FlaggedOrdersAlertProps {
  underpaid: number;
  overpaid: number;
  href: string;
}

/** Surfaces paid orders whose received amount didn't match what was owed.
 *
 * Renders nothing when there's nothing wrong — a standing "0 issues" banner
 * trains people to stop reading the spot where problems appear. */
export function FlaggedOrdersAlert({ underpaid, overpaid, href }: FlaggedOrdersAlertProps) {
  const total = underpaid + overpaid;
  if (total === 0) return null;

  return (
    <Link className={styles.alert} href={href}>
      <span className={styles.mark} aria-hidden="true">
        !
      </span>
      <span className={styles.text}>
        <strong>
          {total} paid {total === 1 ? 'order needs' : 'orders need'} review
        </strong>
        {underpaid > 0 && ` · ${underpaid} underpaid`}
        {overpaid > 0 && ` · ${overpaid} overpaid`}
      </span>
      <span className={styles.go}>Review →</span>
    </Link>
  );
}
