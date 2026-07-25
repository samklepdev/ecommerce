'use client';

import { Bar, BarChart, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts';

import { Money } from '@/shared/domain/money';
import type { DailyRevenue } from '@/modules/orders/application/use-cases/get-revenue-summary';
import { withPreviousValue } from './chart-tooltip-math';
import { createChartTooltip } from './ChartTooltip';

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
        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} tickFormatter={format} />
        <RechartsTooltip content={tooltip} />
        <Bar dataKey="value" fill="var(--color-success)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
