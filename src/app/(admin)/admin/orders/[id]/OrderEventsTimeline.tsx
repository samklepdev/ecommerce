import type { OrderEventRecord } from '@/modules/orders/application/use-cases/list-order-events';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import styles from './OrderEventsTimeline.module.css';

const EVENT_LABEL: Record<string, string> = {
  order_created: 'Order created',
  payment_status_changed: 'Payment status',
  fulfillment_status_changed: 'Fulfillment status',
};

export interface OrderEventsTimelineProps {
  events: OrderEventRecord[];
}

/** Chronological history of an order's status transitions — the `orders`
 * row only ever shows current state, this shows how it got there. */
export function OrderEventsTimeline({ events }: OrderEventsTimelineProps) {
  if (events.length === 0) return null;

  return (
    <Card>
      <h2 className={styles.title}>Timeline</h2>
      <ul className={styles.list}>
        {events.map((event) => (
          <li key={event.id} className={styles.item}>
            <span className={styles.time}>{event.createdAt.toLocaleString()}</span>
            <span>{EVENT_LABEL[event.eventType] ?? event.eventType}</span>
            <Badge tone="neutral">{event.status}</Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
}
