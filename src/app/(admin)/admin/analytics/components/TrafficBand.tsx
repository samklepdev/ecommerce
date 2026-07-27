'use client';

import { useRef, useState } from 'react';

import { formatCount, shortDay } from '../format';
import styles from './TrafficBand.module.css';

export interface TrafficBandPoint {
  day: string;
  /** Drives the line's geometry. */
  views: number;
  /** Drives the bars' geometry. */
  cartChanges: number;
  searches: number;
}

export interface TrafficBandProps {
  /** One point per calendar day in the range, already gap-filled — the line
   * and the bars are read by the same index, so a missing day in either
   * series would pair the wrong figures under the cursor.
   *
   * Plain numbers and strings only: this is a client component, and props
   * crossing the server boundary have to be serializable. */
  points: TrafficBandPoint[];
}

const W = 1000;
const H = 230;
const PAD_T = 18;
const PAD_B = 26;

/**
 * Site traffic over the range: page views as a line, cart changes as bars.
 *
 * The two aren't on a shared scale — views outnumber cart changes by an
 * order of magnitude, and the question worth answering is whether visits
 * and intent move together, which is about shape rather than magnitude.
 * Exact figures live in the readout strip below, so nothing floats over
 * the plot.
 */
export function TrafficBand({ points }: TrafficBandProps) {
  const [hover, setHover] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const maxViews = Math.max(...points.map((p) => p.views), 1);
  const maxCart = Math.max(...points.map((p) => p.cartChanges), 1);
  const step = W / points.length;

  const yViews = (views: number) => PAD_T + (1 - views / (maxViews * 1.12)) * (H - PAD_T - PAD_B);
  const x = (i: number) => i * step + step / 2;

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${yViews(p.views)}`).join(' ');
  const area = `${line} L${x(points.length - 1)},${H - PAD_B} L${x(0)},${H - PAD_B} Z`;
  const gridVals = [0.33, 0.66, 1].map((f) => maxViews * f);

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;

    const i = Math.min(
      points.length - 1,
      Math.max(0, Math.floor(((e.clientX - rect.left) / rect.width) * points.length)),
    );
    setHover(i);
  }

  const active = hover === null ? null : (points[hover] ?? null);
  // Evenly spaced ticks that always include both ends, whatever the span.
  const ticks = [
    ...new Set([0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * (points.length - 1)))),
  ].flatMap((i) => {
    const point = points[i];
    return point ? [{ index: i, day: point.day }] : [];
  });

  return (
    <div
      className={styles.band}
      ref={wrapRef}
      onMouseMove={onMove}
      onMouseLeave={() => setHover(null)}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className={styles.svg}
        role="img"
        aria-label={`Page views and cart changes across ${points.length} days`}
      >
        <defs>
          <linearGradient id="trafficBandFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.20" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {gridVals.map((v, i) => (
          <line
            key={i}
            x1="0"
            x2={W}
            y1={yViews(v)}
            y2={yViews(v)}
            stroke="var(--line)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {points.map((p, i) => {
          const barHeight = (p.cartChanges / (maxCart * 1.35)) * (H - PAD_T - PAD_B);
          return (
            <rect
              key={p.day}
              x={x(i) - step * 0.22}
              width={step * 0.44}
              y={H - PAD_B - barHeight}
              height={barHeight}
              fill="var(--accent-bright)"
              opacity={hover === i ? 0.5 : 0.25}
            />
          );
        })}

        <path d={area} fill="url(#trafficBandFill)" />
        <path
          d={line}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        <line
          x1="0"
          x2={W}
          y1={H - PAD_B}
          y2={H - PAD_B}
          stroke="var(--line-strong)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />

        {hover !== null && active && (
          <>
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={PAD_T - 8}
              y2={H - PAD_B}
              stroke="var(--ink)"
              strokeWidth="1"
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
              opacity="0.5"
            />
            <circle
              cx={x(hover)}
              cy={yViews(active.views)}
              r="3.5"
              fill="var(--surface)"
              stroke="var(--accent)"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}
      </svg>

      <div className={styles.axisY} aria-hidden="true">
        {[...gridVals].reverse().map((v, i) => (
          <span key={i}>{formatCount(Math.round(v))}</span>
        ))}
      </div>

      <div className={styles.axisX} aria-hidden="true">
        {ticks.map((tick) => (
          <span key={tick.index} style={{ left: `${((tick.index + 0.5) / points.length) * 100}%` }}>
            {shortDay(tick.day)}
          </span>
        ))}
      </div>

      {/* A fixed strip rather than a tooltip that follows the cursor: it
          never covers the data it describes, and it holds the legend when
          nothing is hovered instead of appearing from nowhere. */}
      <div className={styles.readout}>
        {active ? (
          <>
            <span className={styles.day}>{shortDay(active.day)}</span>
            <span className={`${styles.dot} ${styles.accentDot}`} />
            <span className={styles.value}>{formatCount(active.views)} views</span>
            <span className={`${styles.dot} ${styles.brightDot}`} />
            <span className={styles.value}>{formatCount(active.cartChanges)} cart changes</span>
            <span className={styles.meta}>{formatCount(active.searches)} searches</span>
          </>
        ) : (
          <>
            <span className={`${styles.dot} ${styles.accentDot}`} />
            <span className={styles.meta}>Page views</span>
            <span className={`${styles.dot} ${styles.brightDot}`} />
            <span className={styles.meta}>Cart changes</span>
          </>
        )}
      </div>
    </div>
  );
}
