'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts';

import { Money } from '@/shared/domain/money';
import type { DailyRevenue } from '@/modules/orders/application/use-cases/get-revenue-summary';
import { withPreviousValue } from './chart-tooltip-math';
import { createChartTooltip } from './ChartTooltip';
import { CHART_COLORS, CHART_GRID_STROKE, CHART_TICK_STYLE } from './chart-theme';

export interface RevenueChartProps {
  data: DailyRevenue[];
  currency: string;
}

export function RevenueChart({ data, currency }: RevenueChartProps) {
  const points = withPreviousValue(data.map((d) => ({ label: d.day, value: d.totalMinor })));
  const format = (value: number) => Money.of(value, currency).toDisplayString();
  const tooltip = createChartTooltip(format);

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={points}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} vertical={false} />
        <XAxis dataKey="label" tick={CHART_TICK_STYLE} />
        <YAxis allowDecimals={false} tick={CHART_TICK_STYLE} tickFormatter={format} />
        <RechartsTooltip content={tooltip} />
        <Bar dataKey="value" fill={CHART_COLORS.success} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
