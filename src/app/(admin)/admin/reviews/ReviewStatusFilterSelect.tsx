'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { Select } from '@/components/ui/Input';

interface ReviewStatusFilterSelectProps {
  /** Raw `status` query param value — not pre-parsed, so an unrecognized
   * value (e.g. `'all'`) still renders selected in the dropdown. */
  selectedStatus?: string;
}

export function ReviewStatusFilterSelect({ selectedStatus }: ReviewStatusFilterSelectProps) {
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
        const query = params.toString();
        router.push(query ? `${pathname}?${query}` : pathname);
      }}
    >
      <option value="">Pending (default)</option>
      <option value="approved">Approved</option>
      <option value="rejected">Rejected</option>
      <option value="all">All statuses</option>
    </Select>
  );
}
