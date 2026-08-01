'use client';

import { useState, type ReactNode } from 'react';

import { Tabs } from '@/components/ui/Tabs';
import styles from './ProductTabs.module.css';

export interface ProductTabsProps {
  /** Server-rendered markdown, handed in as a node so `ReactMarkdown` and
   * its plugins stay out of the client bundle. */
  description: ReactNode;
}

type TabId = 'description' | 'shipping';

const TABS = [
  { value: 'description' as const, label: 'Description' },
  { value: 'shipping' as const, label: 'Shipping' },
];

/**
 * Description and policy, one panel at a time.
 *
 * The prototype had a third "Specifications" tab. `Product` carries no spec
 * fields — only name, description, category and price — so there was nothing
 * to put in it that wasn't invented. Two real tabs beat three with one empty.
 *
 * **No returns or refunds copy here, deliberately.** This used to promise
 * 30-day returns on sealed devices and describe how a refund would be sent
 * on-chain. Neither exists: there is no refund mechanism (see `order-status.ts`)
 * and returns aren't offered, so both were commitments nothing could keep,
 * repeated on every product page in the catalogue.
 *
 * Don't reinstate either. A policy stated here is stated on every product page
 * and reads as a promise; statements of that kind belong in `/terms`, written by
 * someone who can actually make them. Note the tab says "Shipping" now rather
 * than "Shipping & returns" for the same reason — the heading was itself the
 * promise.
 */
export function ProductTabs({ description }: ProductTabsProps) {
  const [active, setActive] = useState<TabId>('description');

  return (
    <section className={styles.detail}>
      <Tabs tabs={TABS} value={active} onChange={setActive} label="Product detail" />

      <div
        className={styles.panel}
        role="tabpanel"
        id={`panel-${active}`}
      >
        {active === 'description' ? (
          (description ?? <p className={styles.empty}>No description yet.</p>)
        ) : (
          <div className={styles.prose}>
            <p>
              Orders ship once payment reaches the confirmation threshold on-chain. Packaging
              is unbranded.
            </p>
            <p>
              Tracking follows by email once a parcel is dispatched, usually within 24&ndash;48
              hours of payment confirming.
            </p>
            <p>Any question about an order — contact support with your order id.</p>
          </div>
        )}
      </div>
    </section>
  );
}
