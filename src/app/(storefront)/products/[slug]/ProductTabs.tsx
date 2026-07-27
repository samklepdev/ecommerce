'use client';

import { useState, type ReactNode } from 'react';

import { cx } from '@/components/ui/cx';
import styles from './ProductTabs.module.css';

export interface ProductTabsProps {
  /** Server-rendered markdown, handed in as a node so `ReactMarkdown` and
   * its plugins stay out of the client bundle. */
  description: ReactNode;
}

type TabId = 'description' | 'shipping';

const TABS: { id: TabId; label: string }[] = [
  { id: 'description', label: 'Description' },
  { id: 'shipping', label: 'Shipping & returns' },
];

/**
 * Description and policy, one panel at a time.
 *
 * The prototype had a third "Specifications" tab. `Product` carries no spec
 * fields — only name, description, category and per-variant SKU and price —
 * so there was nothing to put in it that wasn't invented. Two real tabs beat
 * three with one empty.
 */
export function ProductTabs({ description }: ProductTabsProps) {
  const [active, setActive] = useState<TabId>('description');

  return (
    <section className={styles.detail}>
      <div className={styles.tabs} role="tablist" aria-label="Product detail">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={active === tab.id}
            aria-controls={`panel-${tab.id}`}
            className={cx(styles.tab, active === tab.id && styles.tabOn)}
            onClick={() => setActive(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        className={styles.panel}
        role="tabpanel"
        id={`panel-${active}`}
        aria-labelledby={`tab-${active}`}
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
              <strong>Refunds.</strong> Refunds are sent on-chain to an address you provide, at
              the BTC amount originally received — not its fiat value, which will have moved.
              Network fees come out of the refund. Because crypto payments are irreversible,
              refunds are arranged with support rather than issued automatically.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
