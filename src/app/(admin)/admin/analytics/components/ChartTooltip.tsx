'use client';

import type { ReactNode } from 'react';
import type { TooltipContentProps } from 'recharts';

import { percentChange, type ChartPoint } from './chart-tooltip-math';
import styles from './ChartTooltip.module.css';

/** Builds a Recharts `<Tooltip content={...}>` renderer for one chart.
 * `valueFormatter` lets each chart display its own unit (views, currency,
 * BTC) while sharing the same layout and %-change-vs-previous-point
 * logic. Returns the plain (un-parameterized) `TooltipContentProps` shape
 * — `Tooltip` isn't JSX-generic, so that's the only type its `content`
 * prop ever actually accepts — so callers can pass the result straight to
 * `<Tooltip content={...} />` with no cast at the call site. */
export function createChartTooltip(
  valueFormatter: (value: number) => string,
): (props: TooltipContentProps) => ReactNode {
  const tooltip = ({ active, payload }: TooltipContentProps<number, string>) => {
    if (!active || !payload || payload.length === 0) return null;
    const point = payload[0]?.payload as ChartPoint | undefined;
    if (!point) return null;

    const change = percentChange(point.value, point.previousValue);

    return (
      <div className={styles.tooltip}>
        <p className={styles.label}>{point.label}</p>
        <p className={styles.value}>{valueFormatter(point.value)}</p>
        {change !== null && (
          <p className={change >= 0 ? styles.changeUp : styles.changeDown}>
            {change >= 0 ? '+' : ''}
            {change}% vs previous
          </p>
        )}
      </div>
    );
  };
  return tooltip as unknown as (props: TooltipContentProps) => ReactNode;
}
