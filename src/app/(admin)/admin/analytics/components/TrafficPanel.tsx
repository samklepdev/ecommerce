import Link from 'next/link';

import { formatCount } from '../format';
import styles from './TrafficPanel.module.css';

export type SparkTone = 'slate' | 'accent';

interface SparklineProps {
  values: number[];
  tone: SparkTone;
}

const SPARK_W = 160;
const SPARK_H = 40;

function Sparkline({ values, tone }: SparklineProps) {
  if (values.length === 0) return <div className={styles.sparkEmpty} aria-hidden="true" />;

  const max = Math.max(...values, 1);
  const step = SPARK_W / values.length;
  const stroke = tone === 'accent' ? 'var(--accent)' : 'var(--slate)';

  const path = values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${i * step + step / 2},${SPARK_H - 3 - (v / max) * (SPARK_H - 8)}`)
    .join(' ');

  return (
    <svg
      className={styles.spark}
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={`${path} L${SPARK_W},${SPARK_H} L0,${SPARK_H} Z`} fill={stroke} opacity="0.10" />
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export interface TrafficPanelProps {
  label: string;
  total: number;
  /** Gap-filled daily values for the sparkline. */
  values: number[];
  /** Days in the range, for the per-day figure. */
  days: number;
  tone: SparkTone;
  href: string;
}

/** One traffic metric: the total, its shape over the range, and the rate.
 *
 * The whole panel is the link to its drill-down — a metric you can see is a
 * metric you'll want to open, and a separate "view details" control would
 * be a second thing to aim at for the same destination. */
export function TrafficPanel({ label, total, values, days, tone, href }: TrafficPanelProps) {
  return (
    <Link className={styles.panel} href={href}>
      <span className={styles.eyebrow}>{label}</span>
      <span className={styles.value}>{formatCount(total)}</span>
      <Sparkline values={values} tone={tone} />
      <span className={styles.foot}>{(total / days).toFixed(1)} / day</span>
    </Link>
  );
}
