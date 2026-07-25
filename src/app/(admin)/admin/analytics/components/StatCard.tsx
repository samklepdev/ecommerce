import styles from './StatCard.module.css';

export interface StatCardProps {
  label: string;
  value: string;
}

/** One KPI number: small muted label on top, large bold value below. No
 * %-change — chart tooltips already cover period-over-period comparison;
 * adding it here would require fetching a second date range per page load. */
export function StatCard({ label, value }: StatCardProps) {
  return (
    <div className={styles.card}>
      <p className={styles.label}>{label}</p>
      <p className={styles.value}>{value}</p>
    </div>
  );
}
