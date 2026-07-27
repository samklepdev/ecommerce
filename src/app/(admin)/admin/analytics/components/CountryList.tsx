import type { CountryViews } from '@/modules/analytics/application/ports/analytics-event-repository';
import { formatCount } from '../format';
import styles from './CountryList.module.css';

export interface CountryListProps {
  items: CountryViews[];
}

/** Page views by country, with a representative IP per row.
 *
 * The country is derived from the IP at record time, so the two columns
 * always agree — the address shown is one the country was actually resolved
 * from, not a separate signal that happens to sit beside it. */
export function CountryList({ items }: CountryListProps) {
  if (items.length === 0) {
    return (
      <section className={styles.card}>
        <h3 className={styles.title}>By country</h3>
        <p className={styles.empty}>
          No country resolved yet. Country comes from the visitor&apos;s IP,
          and requests to localhost carry no forwarded address — set{' '}
          <code>ANALYTICS_DEV_IP</code> to see this populate in development.
        </p>
      </section>
    );
  }

  const max = Math.max(...items.map((i) => i.views), 1);

  return (
    <section className={styles.card}>
      <h3 className={styles.title}>By country</h3>
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.country}>
            <span className={styles.bar} style={{ width: `${(item.views / max) * 100}%` }} />
            <span className={styles.name} title={`${item.country} · ${item.continent}`}>
              {item.country}
            </span>
            <span className={styles.ip} title={`Example address from ${item.country}`}>
              {item.sampleIp ?? '—'}
            </span>
            <span className={styles.views}>{formatCount(item.views)}</span>
          </li>
        ))}
      </ul>
      <span className={styles.foot}>views · sample address</span>
    </section>
  );
}
