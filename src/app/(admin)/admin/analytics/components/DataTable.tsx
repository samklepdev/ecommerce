import type { ReactNode } from 'react';

import styles from './DataTable.module.css';

export interface DataTableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyLabel: string;
}

/** Generic styled table — zebra striping, hover highlight, consistent
 * header treatment — or the empty-state paragraph when `rows` is empty.
 * Replaces the ad hoc `<ul>`/`<table>` markup previously duplicated per
 * list/table on the analytics pages. */
export function DataTable<T>({ columns, rows, rowKey, emptyLabel }: DataTableProps<T>) {
  if (rows.length === 0) return <p className={styles.empty}>{emptyLabel}</p>;

  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key}>{col.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((col) => (
                <td key={col.key}>{col.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
