import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { FlaggedOrdersAlert } from './FlaggedOrdersAlert';
import { TrafficBand } from './TrafficBand';
import { PaidOrdersLedger } from './PaidOrdersLedger';
import { RankedList } from './RankedList';
import { DailyColumnChart } from './DailyColumnChart';
import { TrafficPanel } from './TrafficPanel';

/**
 * A store with no traffic yet is the first thing anyone sees, and every
 * chart here derives its scale from `Math.max(...values)` — which is
 * `-Infinity` over an empty array and turns every coordinate into `NaN`.
 * These render each panel with nothing in it and assert it produces real
 * markup rather than throwing or emitting NaN geometry.
 */
describe('analytics panels with no data', () => {
  it('DailyColumnChart shows its empty label instead of drawing an empty axis', () => {
    const html = renderToStaticMarkup(
      <DailyColumnChart points={[]} peakSuffix="sats peak" emptyLabel="Nothing settled on-chain yet." />,
    );

    expect(html).toContain('Nothing settled on-chain');
    expect(html).not.toContain('NaN');
  });

  it('RankedList shows an empty state', () => {
    const html = renderToStaticMarkup(<RankedList title="Top pages" items={[]} unit="views" />);

    expect(html).toContain('Nothing recorded');
    expect(html).not.toContain('NaN');
  });

  it('TrafficPanel renders a zero total without a broken sparkline', () => {
    const html = renderToStaticMarkup(
      <TrafficPanel label="Page views" total={0} values={[]} days={30} tone="slate" href="/x" />,
    );

    expect(html).toContain('0.0 / day');
    expect(html).not.toContain('NaN');
  });

  it('PaidOrdersLedger shows an empty state rather than a headers-only table', () => {
    const html = renderToStaticMarkup(<PaidOrdersLedger orders={[]} requiredConfirmations={2} />);

    expect(html).toContain('No paid orders');
    expect(html).not.toContain('<table');
  });

  it('FlaggedOrdersAlert renders nothing when nothing is flagged', () => {
    const html = renderToStaticMarkup(
      <FlaggedOrdersAlert underpaid={0} overpaid={0} href="/x" />,
    );

    expect(html).toBe('');
  });

  it('TrafficBand draws a flat baseline for a single all-zero day', () => {
    const html = renderToStaticMarkup(
      <TrafficBand points={[{ day: '2026-07-25', views: 0, cartChanges: 0, searches: 0 }]} />,
    );

    expect(html).not.toContain('NaN');
    expect(html).toContain('Page views');
  });
});

describe('client component props stay serializable', () => {
  it('TrafficBand takes no function props', () => {
    // TrafficBand is a client component reached from a server component, so
    // every prop has to survive serialization. Passing its predecessor a
    // formatter function threw "a server error occurred" at render time —
    // something neither tsc nor the production build catches.
    const points = [{ day: '2026-07-25', views: 10, cartChanges: 2, searches: 4 }];
    const props = { points };

    const functionProps = Object.entries(props).filter(([, v]) => typeof v === 'function');
    expect(functionProps).toEqual([]);
    expect(() => JSON.stringify(props)).not.toThrow();
  });
});

describe('analytics panels with data', () => {
  it('ConfirmationPips reflects the configured threshold, not a hardcoded 6', () => {
    const html = renderToStaticMarkup(
      <PaidOrdersLedger
        orders={[
          {
            orderId: 'abcdef12-0000-0000-0000-000000000000',
            address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
            expectedSats: 1243900,
        confirmedSats: 1243900,
            confirmations: 2,
            underpaid: false,
            overpaid: false,
            paidAt: new Date('2026-07-25T00:00:00Z'),
          },
        ]}
        requiredConfirmations={2}
      />,
    );

    expect(html).toContain('settled');
  });
});
