import type { RegionViews } from '@/modules/analytics/application/ports/analytics-event-repository';
import { formatCount } from '../format';
import styles from './CountryList.module.css';

export interface RegionListProps {
  items: RegionViews[];
}

/** Page views by state, province or region.
 *
 * The country rides along on every row: "Victoria" is in both Australia and
 * Canada, and region names are nowhere near unique on their own. */
export function RegionList({ items }: RegionListProps) {
  if (items.length === 0) {
    return (
      <section className={styles.card}>
        <h3 className={styles.title}>By state / region</h3>
        <p className={styles.empty}>
          No region resolved yet. Some addresses only resolve to a country,
          and those are left out here rather than lumped under
          &ldquo;Unknown&rdquo;.
        </p>
      </section>
    );
  }

  const max = Math.max(...items.map((i) => i.views), 1);

  return (
    <section className={styles.card}>
      <h3 className={styles.title}>By state / region</h3>
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={`${item.country}-${item.region}`}>
            <span className={styles.bar} style={{ width: `${(item.views / max) * 100}%` }} />
            <span className={styles.name} title={`${item.region}, ${item.country}`}>
              {item.region}
              <span className={styles.sub}> · {item.country}</span>
            </span>
            {item.topCity && (
              <span className={styles.ip} title={`Most-seen city in ${item.region}`}>
                {item.topCity}
              </span>
            )}
            <span className={styles.views}>{formatCount(item.views)}</span>
          </li>
        ))}
      </ul>
      <span className={styles.foot}>views · top city</span>
    </section>
  );
}
