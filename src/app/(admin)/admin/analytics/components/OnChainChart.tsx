'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts';

import { satsToBtcString } from '@/modules/payments/domain/bip21';
import type { DailySats } from '@/modules/payments/application/use-cases/get-on-chain-activity-report';
import { withPreviousValue } from './chart-tooltip-math';
import { createChartTooltip } from './ChartTooltip';
import { CHART_COLORS, CHART_GRID_STROKE, CHART_TICK_STYLE } from './chart-theme';

export interface OnChainChartProps {
  data: DailySats[];
}

export function OnChainChart({ data }: OnChainChartProps) {
  const points = withPreviousValue(data.map((d) => ({ label: d.day, value: d.sats })));
  const format = (value: number) => `${satsToBtcString(value)} BTC`;
  const tooltip = createChartTooltip(format);

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={points}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} vertical={false} />
        <XAxis dataKey="label" tick={CHART_TICK_STYLE} />
        <YAxis allowDecimals={false} tick={CHART_TICK_STYLE} tickFormatter={format} />
        <RechartsTooltip content={tooltip} />
        <Bar dataKey="value" fill={CHART_COLORS.bitcoin} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
