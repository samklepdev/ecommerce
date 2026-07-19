'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { Select } from '@/components/ui/Input';

interface SupplierFilterSelectProps {
  suppliers: Array<{ id: string; name: string }>;
  selectedSupplierId?: string;
}

export function SupplierFilterSelect({ suppliers, selectedSupplierId }: SupplierFilterSelectProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <Select
      value={selectedSupplierId ?? ''}
      onChange={(e) => {
        const params = new URLSearchParams(searchParams.toString());
        if (e.target.value) {
          params.set('supplierId', e.target.value);
        } else {
          params.delete('supplierId');
        }
        const query = params.toString();
        router.push(query ? `${pathname}?${query}` : pathname);
      }}
    >
      <option value="">All sources</option>
      {suppliers.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </Select>
  );
}
