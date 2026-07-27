import styles from './Rating.module.css';

export interface RatingProps {
  /** 0–5, fractional allowed — the fill is clipped to the exact share. */
  value: number;
  /** Star size in pixels. */
  size?: number;
  showValue?: boolean;
  /** Renders "(N reviews)" after the stars when given. */
  count?: number;
}

/**
 * Stars, monochrome on purpose.
 *
 * Amber means "denominated in sats" everywhere else in this app, so gold
 * stars would dilute the one colour rule the whole system runs on. The fill
 * is a clipped overlay rather than rounded half-stars, so 4.6 reads as 4.6.
 */
export function Rating({ value, size = 13, showValue = false, count }: RatingProps) {
  return (
    <span className={styles.rating} style={{ '--star-size': `${size}px` } as React.CSSProperties}>
      <span className={styles.stars} aria-hidden="true">
        <span className={styles.base}>★★★★★</span>
        <span className={styles.fill} style={{ width: `${(value / 5) * 100}%` }}>
          ★★★★★
        </span>
      </span>
      <span className={styles.srOnly}>{value.toFixed(1)} out of 5</span>
      {showValue && <span className={styles.value}>{value.toFixed(1)}</span>}
      {count != null && (
        <span className={styles.count}>
          ({count} review{count === 1 ? '' : 's'})
        </span>
      )}
    </span>
  );
}
