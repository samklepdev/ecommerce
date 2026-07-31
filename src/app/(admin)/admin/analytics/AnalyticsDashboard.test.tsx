import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AnalyticsDashboard, type AnalyticsDashboardProps } from './AnalyticsDashboard';

/**
 * Renders the entire dashboard tree.
 *
 * The page itself is unreachable without a database and an admin session, so
 * every runtime fault in this view — a bad prop across the client boundary,
 * NaN geometry, an index off the end of an array — used to surface only in
 * the browser. This exercises the whole tree with no infrastructure.
 */

const since = new Date('2026-06-25T00:00:00.000Z');
const until = new Date('2026-07-25T23:59:59.999Z');

function props(overrides: Partial<AnalyticsDashboardProps> = {}): AnalyticsDashboardProps {
  const days = ['2026-07-23', '2026-07-24', '2026-07-25'];

  return {
    since,
    until,
    windowDays: 30,
    totalViews: 1170,
    viewsDelta: { direction: 'up', percent: 8.2 },
    totalRevenueLabel: '$1,284.00',
    revenueDelta: { direction: 'up', percent: 12.4 },
    totalSatsLabel: '0.0421',
    totalItems: 128,
    addressCount: 41,
    bandPoints: days.map((day, i) => ({
      day,
      views: 210 + i * 100,
      cartChanges: 11 + i * 5,
      searches: 28 + i * 10,
    })),
    satsPerDay: days.map((day, i) => ({ day, sats: 120000 + i * 5000 })),
    viewsPerDay: [210, 640, 320],
    searchesPerDay: [28, 96, 44],
    cartChangesPerDay: [11, 44, 22],
    topPaths: [
      { value: '/', count: 4128 },
      { value: '/shop/hardware-wallets', count: 2410 },
    ],
    topReferrers: [{ value: 'google.com', count: 3012 }],
    topSearchTerms: [{ value: 'seed backup', count: 412 }],
    orders: [
      {
        orderId: '9f3c2ad1-7e40-4b21-9c88-1ab4f0e21d77',
        address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
        expectedSats: 1243900,
        confirmedSats: 1243900,
        confirmations: 6,
        underpaid: false,
        overpaid: false,
        paidAt: new Date('2026-07-24T10:00:00Z'),
      },
      {
        orderId: 'c81e4f6b-11a3-4d55-b0e9-72fa8c40911d',
        address: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
        expectedSats: 2870450,
        confirmedSats: 2870450,
        confirmations: 1,
        underpaid: true,
        overpaid: false,
        paidAt: new Date('2026-07-25T09:00:00Z'),
      },
    ],
    requiredConfirmations: 2,
    ...overrides,
  };
}

describe('AnalyticsDashboard', () => {
  it('renders the full page with realistic data', () => {
    const html = renderToStaticMarkup(<AnalyticsDashboard {...props()} />);

    expect(html).toContain('Analytics');
    expect(html).toContain('Revenue booked');
    expect(html).toContain('$1,284.00');
    expect(html).toContain('0.0421 BTC');
    expect(html).toContain('On-chain settlement');
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('undefined');
  });

  it('renders with a completely empty dataset', () => {
    // What a fresh install shows. Every chart scales off Math.max over its
    // values, which is -Infinity on an empty array.
    const html = renderToStaticMarkup(
      <AnalyticsDashboard
        {...props({
          bandPoints: [],
          satsPerDay: [],
          totalViews: 0,
          viewsDelta: null,
          revenueDelta: null,
          totalRevenueLabel: '$0.00',
          totalSatsLabel: '0',
          totalItems: 0,
          addressCount: 0,
          viewsPerDay: [],
          searchesPerDay: [],
          cartChangesPerDay: [],
          topPaths: [],
          topReferrers: [],
          topSearchTerms: [],
          orders: [],
        })}
      />,
    );

    expect(html).toContain('No traffic in the previous 30 days');
    expect(html).toContain('Nothing settled on-chain');
    expect(html).toContain('No paid orders');
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('Infinity');
  });

  it('surfaces flagged orders and hides the alert when there are none', () => {
    const withFlags = renderToStaticMarkup(<AnalyticsDashboard {...props()} />);
    expect(withFlags).toContain('1 underpaid');

    const clean = renderToStaticMarkup(
      <AnalyticsDashboard {...props({ orders: [props().orders[0]!] })} />,
    );
    expect(clean).not.toContain('needs review');
  });

  it('renders a single-day range without dividing by zero', () => {
    const html = renderToStaticMarkup(
      <AnalyticsDashboard
        {...props({
          windowDays: 1,
          bandPoints: [{ day: '2026-07-25', views: 12, cartChanges: 1, searches: 3 }],
          satsPerDay: [{ day: '2026-07-25', sats: 90000 }],
          viewsPerDay: [12],
          searchesPerDay: [3],
          cartChangesPerDay: [1],
        })}
      />,
    );

    expect(html).toContain('12.0 / day');
    expect(html).not.toContain('NaN');
  });
});
