'use client';

import { cx } from './cx';
import styles from './Tabs.module.css';

export interface TabItem<T extends string> {
  value: T;
  label: string;
  /** Optional count beside the label, e.g. how many rows the tab holds. */
  count?: number;
}

interface TabsProps<T extends string> {
  tabs: TabItem<T>[];
  value: T;
  onChange: (next: T) => void;
  /** Names the tablist for assistive tech. */
  label?: string;
}

export function Tabs<T extends string>({ tabs, value, onChange, label }: TabsProps<T>) {
  return (
    <div className={styles.tabs} role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={value === tab.value}
          className={cx(styles.tab, value === tab.value && styles.on)}
          onClick={() => onChange(tab.value)}
        >
          {tab.label}
          {tab.count != null && <span className={styles.count}>{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}
