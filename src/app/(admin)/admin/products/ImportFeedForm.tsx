'use client';

import { useActionState } from 'react';

import { importProductsFromFeedAction, type ImportFeedActionResult } from '@/app/actions/admin/catalog';
import { Field } from '@/components/ui/Field';
import { Input, Select } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';

interface Supplier {
  id: string;
  name: string;
}

interface ImportFeedFormProps {
  suppliers: Supplier[];
}

const initialState: ImportFeedActionResult = {};

export function ImportFeedForm({ suppliers }: ImportFeedFormProps) {
  const [state, formAction, isPending] = useActionState(importProductsFromFeedAction, initialState);

  return (
    <form action={formAction}>
      <Field label="Supplier" htmlFor="importSupplierId">
        <Select id="importSupplierId" name="supplierId" required defaultValue="">
          <option value="" disabled>
            Select a supplier
          </option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Feed URL"
        htmlFor="feedUrl"
        hint="A JSON product list, e.g. a WooCommerce Store API endpoint (/wp-json/wc/store/v1/products)"
      >
        <Input type="url" id="feedUrl" name="feedUrl" required />
      </Field>

      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.message && <Alert tone="success">{state.message}</Alert>}

      <Button type="submit" disabled={isPending}>
        {isPending ? 'Importing…' : 'Import products'}
      </Button>
    </form>
  );
}
