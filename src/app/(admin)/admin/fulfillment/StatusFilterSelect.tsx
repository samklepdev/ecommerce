'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { Select } from '@/components/ui/Input';
import type { SupplierOrderStatus } from '@/modules/orders/domain/supplier-order-status';

interface StatusFilterSelectProps {
  /** Raw `status` query param value — `'all'` or a specific status string,
   * not pre-parsed, so `'all'` still renders selected in the dropdown. */
  selectedStatus?: string;
}

const STATUS_OPTIONS: { value: SupplierOrderStatus; label: string }[] = [
  { value: 'needs_ordering', label: 'Needs ordering' },
  { value: 'ordered', label: 'Ordered' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'cancelled', label: 'Cancelled' },
];

export function StatusFilterSelect({ selectedStatus }: StatusFilterSelectProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <Select
      value={selectedStatus ?? ''}
      onChange={(e) => {
        const params = new URLSearchParams(searchParams.toString());
        if (e.target.value) {
          params.set('status', e.target.value);
        } else {
          params.delete('status');
        }
        params.delete('page');
        const query = params.toString();
        router.push(query ? `${pathname}?${query}` : pathname);
      }}
    >
      <option value="">Needs action (default)</option>
      {STATUS_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
      <option value="all">All statuses</option>
    </Select>
  );
}
