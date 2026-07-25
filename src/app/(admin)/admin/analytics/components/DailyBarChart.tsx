'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts';

import type { DailyCount } from '@/modules/analytics/application/ports/analytics-event-repository';
import { withPreviousValue } from './chart-tooltip-math';
import { createChartTooltip } from './ChartTooltip';
import { CHART_COLORS, CHART_GRID_STROKE, CHART_TICK_STYLE } from './chart-theme';

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
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} vertical={false} />
        <XAxis dataKey="label" tick={CHART_TICK_STYLE} />
        <YAxis allowDecimals={false} tick={CHART_TICK_STYLE} />
        <RechartsTooltip content={tooltip} />
        <Bar dataKey="value" fill={CHART_COLORS.accent} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
