'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { Select } from '@/components/ui/Input';

interface CategoryFilterSelectProps {
  categories: string[];
  selectedCategory?: string;
}

/** Mirrors the admin `SupplierFilterSelect`'s exact auto-navigate-on-change
 * pattern. Resets to page 1 whenever the filter changes, since the old page
 * number may no longer be valid for the new filtered result set. */
export function CategoryFilterSelect({ categories, selectedCategory }: CategoryFilterSelectProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <Select
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
      <option value="">All categories</option>
      {categories.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </Select>
  );
}
