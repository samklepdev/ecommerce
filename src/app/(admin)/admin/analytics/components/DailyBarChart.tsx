'use client';

import { Bar, BarChart, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts';

import type { DailyCount } from '@/modules/analytics/application/ports/analytics-event-repository';
import { withPreviousValue } from './chart-tooltip-math';
import { createChartTooltip } from './ChartTooltip';

export interface DailyBarChartProps {
  data: DailyCount[];
  /** Unit label shown in the tooltip, e.g. "views", "cart changes". */
  label: string;
}

export function DailyBarChart({ data, label }: DailyBarChartProps) {
  const points = withPreviousValue(data.map((d) => ({ label: d.day, value: d.count })));
  const tooltip = createChartTooltip((value) => `${value} ${label}`);

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={points}>
        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <RechartsTooltip content={tooltip as any} />
        <Bar dataKey="value" fill="var(--color-accent)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
