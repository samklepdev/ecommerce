'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import styles from './CatalogSelect.module.css';

interface CategoryFilterSelectProps {
  categories: string[];
  selectedCategory?: string;
}

/** Auto-navigates on change — no Apply button, since a single dropdown has
 * nothing to batch. Resets to page 1 whenever the filter changes, because
 * the old page number may not exist in the new result set. */
export function CategoryFilterSelect({ categories, selectedCategory }: CategoryFilterSelectProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <label className={styles.select}>
      <span className={styles.label}>Category</span>
      <select
        className={styles.control}
        value={selectedCategory ?? ''}
        onChange={(e) => {
          const params = new URLSearchParams(searchParams.toString());
          if (e.target.value) {
            params.set('category', e.target.value);
          } else {
            params.delete('category');
          }
          params.delete('page');
          const query = params.toString();
          router.push(query ? `${pathname}?${query}` : pathname);
        }}
      >
        <option value="">All</option>
        {categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </label>
  );
}
