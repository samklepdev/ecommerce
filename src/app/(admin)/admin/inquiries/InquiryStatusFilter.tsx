'use client';

import { useRouter } from 'next/navigation';

import { Select } from '@/components/ui/Input';
import { INQUIRY_STATUSES } from '@/modules/inquiries/domain/inquiry';

/** Same shape as the fulfillment queue's status filter — navigates rather
 * than filtering client-side, so the URL is the state. */
export function InquiryStatusFilter({ selected }: { selected: string }) {
  const router = useRouter();

  return (
    <Select
      aria-label="Filter by status"
      value={selected}
      onChange={(e) => router.push(`/admin/inquiries?status=${e.target.value}`)}
    >
      {INQUIRY_STATUSES.map((status) => (
        <option key={status} value={status}>
          {status.replace('_', ' ')}
        </option>
      ))}
      <option value="all">all</option>
    </Select>
  );
}
