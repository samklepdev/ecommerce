import { describe, expect, it } from 'vitest';

import { ListOrderEvents, type ListOrderEventsRepository, type OrderEventRecord } from './list-order-events';

describe('ListOrderEvents', () => {
  it('returns the events for the given order', async () => {
    const events: OrderEventRecord[] = [
      { id: 'e1', eventType: 'order_created', status: 'pending', metadata: null, createdAt: new Date() },
    ];
    const repo: ListOrderEventsRepository = {
      async listForOrder(orderId) {
        expect(orderId).toBe('order1');
        return events;
      },
    };

    const result = await new ListOrderEvents(repo).execute({ orderId: 'order1' });

    expect(result).toBe(events);
  });
});
