'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import type { ProductSort } from '@/modules/catalog/application/ports/product-repository';
import styles from './CatalogSelect.module.css';

interface SortSelectProps {
  selectedSort?: ProductSort;
}

const SORT_OPTIONS: { value: ProductSort; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price, low to high' },
  { value: 'price_desc', label: 'Price, high to low' },
  { value: 'name_asc', label: 'Name, A–Z' },
  { value: 'name_desc', label: 'Name, Z–A' },
];

/** Mirrors `CategoryFilterSelect`'s auto-navigate-on-change pattern. */
export function SortSelect({ selectedSort }: SortSelectProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <label className={styles.select}>
      <span className={styles.label}>Sort</span>
      <select
        className={styles.control}
        value={selectedSort ?? 'newest'}
        onChange={(e) => {
          const params = new URLSearchParams(searchParams.toString());
          if (e.target.value && e.target.value !== 'newest') {
            params.set('sort', e.target.value);
          } else {
            params.delete('sort');
          }
          params.delete('page');
          const query = params.toString();
          router.push(query ? `${pathname}?${query}` : pathname);
        }}
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
