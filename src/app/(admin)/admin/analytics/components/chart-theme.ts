/** Shared Recharts styling so every chart in this section renders
 * consistently instead of each hand-tuning its own colors/gridlines. */
export const CHART_COLORS = {
  accent: 'var(--color-accent)',
  success: 'var(--color-success)',
  bitcoin: '#f7931a',
} as const;

export const CHART_GRID_STROKE = 'var(--color-border)';

export const CHART_TICK_STYLE = { fontSize: 12 } as const;
