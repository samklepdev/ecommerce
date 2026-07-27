import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AdminOverview, type AdminOverviewProps } from './AdminOverview';

const since = new Date('2026-06-26T00:00:00.000Z');
const until = new Date('2026-07-26T23:59:59.999Z');

function props(overrides: Partial<AdminOverviewProps> = {}): AdminOverviewProps {
  return {
    since,
    until,
    windowDays: 30,
    queues: [
      {
        label: 'Orders awaiting confirmation',
        count: 3,
        href: '/admin/orders',
        hint: 'Seen on-chain but not yet deep enough to fulfil',
      },
      {
        label: 'Unsourced order lines',
        count: 0,
        href: '/admin/fulfillment',
        hint: 'Paid, with no supplier offer to buy from',
      },
    ],
    revenueLabel: '$4,210.00',
    ordersCount: 42,
    itemsSold: 128,
    pageViews: 3482,
    revenuePerDay: [
      { day: '2026-07-24', value: 40000 },
      { day: '2026-07-25', value: 52000 },
      { day: '2026-07-26', value: 31000 },
    ],
    recentOrders: [
      {
        id: '9f3c2ad1-7e40-4b21-9c88-1ab4f0e21d77',
        customerEmail: 'buyer@example.com',
        placed: '2026-07-25',
        amountLabel: '$124.00',
        paymentStatus: 'paid',
        fulfillmentStatus: 'shipped',
      },
      {
        id: 'c81e4f6b-11a3-4d55-b0e9-72fa8c40911d',
        customerEmail: 'someone@example.com',
        placed: '2026-07-24',
        amountLabel: '$61.50',
        paymentStatus: 'awaiting_confirmation',
        fulfillmentStatus: 'unfulfilled',
      },
    ],
    ...overrides,
  };
}

describe('AdminOverview', () => {
  it('renders queues, figures and recent orders', () => {
    const html = renderToStaticMarkup(<AdminOverview {...props()} />);

    expect(html).toContain('Dashboard');
    expect(html).toContain('Orders awaiting confirmation');
    expect(html).toContain('$4,210.00');
    expect(html).toContain('3,482');
    expect(html).toContain('buyer@example.com');
    expect(html).not.toContain('NaN');
  });

  it('hides queues with nothing in them', () => {
    // A standing "0 unsourced lines" tile trains people to stop reading the
    // spot where real work appears.
    const html = renderToStaticMarkup(<AdminOverview {...props()} />);

    expect(html).not.toContain('Unsourced order lines');
  });

  it('says so plainly when there is no work waiting', () => {
    const html = renderToStaticMarkup(
      <AdminOverview {...props({ queues: [{ label: 'x', count: 0, href: '/x', hint: 'y' }] })} />,
    );

    expect(html).toContain('Nothing waiting');
  });

  it('renders a brand-new store with no orders and no revenue', () => {
    const html = renderToStaticMarkup(
      <AdminOverview
        {...props({
          queues: [],
          revenueLabel: '$0.00',
          ordersCount: 0,
          itemsSold: 0,
          pageViews: 0,
          revenuePerDay: [],
          recentOrders: [],
        })}
      />,
    );

    expect(html).toContain('No orders yet.');
    expect(html).toContain('No revenue booked in this range.');
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('Infinity');
  });

  it('links every recent order to its detail page', () => {
    const html = renderToStaticMarkup(<AdminOverview {...props()} />);

    expect(html).toContain('/admin/orders/9f3c2ad1-7e40-4b21-9c88-1ab4f0e21d77');
    expect(html).toContain('/admin/orders/c81e4f6b-11a3-4d55-b0e9-72fa8c40911d');
  });
});
