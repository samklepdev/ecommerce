import type { AnalyticsEventRow } from '@/modules/analytics/application/ports/analytics-event-repository';
import styles from './EventLogTable.module.css';

export interface EventLogTableProps {
  rows: AnalyticsEventRow[];
  /** Column shown between the timestamp and the session, e.g. the searched
   * term or the path. Different event types carry their detail in
   * different fields. */
  detailHeader: string;
  detail: (row: AnalyticsEventRow) => string;
  emptyLabel: string;
}

/** Raw event rows, newest first — the ledger treatment applied to the
 * per-type drill-downs so every table in this section reads the same. */
export function EventLogTable({ rows, detailHeader, detail, emptyLabel }: EventLogTableProps) {
  if (rows.length === 0) return <p className={styles.empty}>{emptyLabel}</p>;

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>When</th>
          <th>{detailHeader}</th>
          <th>Referrer</th>
          <th>Session</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td data-label="When" className={styles.when}>
              {row.createdAt.toISOString().replace('T', ' ').slice(0, 16)}
            </td>
            <td data-label={detailHeader} className={styles.detail} title={detail(row)}>
              {detail(row)}
            </td>
            <td data-label="Referrer" className={styles.muted}>
              {row.referrer ?? '—'}
            </td>
            <td data-label="Session" className={styles.muted}>
              {row.sessionId ? row.sessionId.slice(0, 12) : '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
