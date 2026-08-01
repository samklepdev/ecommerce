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
  { value: 'shipping' as const, label: 'Shipping & returns' },
];

/**
 * Description and policy, one panel at a time.
 *
 * The prototype had a third "Specifications" tab. `Product` carries no spec
 * fields — only name, description, category and price — so there was nothing
 * to put in it that wasn't invented. Two real tabs beat three with one empty.
 *
 * **There is no refunds paragraph, deliberately.** This used to describe how a
 * refund would be sent on-chain; the app has no refund mechanism (see
 * `order-status.ts`), so that was a promise nothing could keep. Don't reinstate
 * it here — a policy this page states is one every product page states, and it
 * would be read as a commitment. Anything of that kind belongs in `/terms`,
 * written by someone who can make the commitment.
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
              <strong>Returns.</strong> Sealed devices can be returned within 30 days. Once a
              tamper-evident bag is opened the device can&apos;t be resold, so opened units are
              only accepted if faulty.
            </p>
            <p>
              To start a return, or for anything else about an order, contact support with your
              order id.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
