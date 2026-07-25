'use client';

import { Bar, BarChart, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts';

import { satsToBtcString } from '@/modules/payments/domain/bip21';
import type { DailySats } from '@/modules/payments/application/use-cases/get-on-chain-activity-report';
import { withPreviousValue } from './chart-tooltip-math';
import { createChartTooltip } from './ChartTooltip';

export interface OnChainChartProps {
  data: DailySats[];
}

const BITCOIN_ORANGE = '#f7931a';

export function OnChainChart({ data }: OnChainChartProps) {
  const points = withPreviousValue(data.map((d) => ({ label: d.day, value: d.sats })));
  const format = (value: number) => `${satsToBtcString(value)} BTC`;
  const tooltip = createChartTooltip(format);

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={points}>
        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} tickFormatter={format} />
        <RechartsTooltip content={tooltip} />
        <Bar dataKey="value" fill={BITCOIN_ORANGE} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
