'use client';

import { useActionState, useState } from 'react';

import { importProductsFromFeedAction, type ImportFeedActionResult } from '@/app/actions/admin/catalog';
import { Field } from '@/components/ui/Field';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';

interface Supplier {
  id: string;
  name: string;
}

interface ImportFeedFormProps {
  suppliers: Supplier[];
}

type SourceType = 'url' | 'json' | 'spreadsheet';

const initialState: ImportFeedActionResult = {};

export function ImportFeedForm({ suppliers }: ImportFeedFormProps) {
  const [state, formAction, isPending] = useActionState(importProductsFromFeedAction, initialState);
  const [sourceType, setSourceType] = useState<SourceType>('url');

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

      <Field label="Source" htmlFor="sourceType">
        <Select
          id="sourceType"
          name="sourceType"
          value={sourceType}
          onChange={(e) => setSourceType(e.target.value as SourceType)}
        >
          <option value="url">Feed URL</option>
          <option value="json">JSON / JS / TS file or pasted JSON</option>
          <option value="spreadsheet">Spreadsheet (.csv or .xlsx)</option>
        </Select>
      </Field>

      {sourceType === 'url' && (
        <Field
          label="Feed URL"
          htmlFor="feedUrl"
          hint="A JSON product list endpoint returning an array of products with name/price/image/stock fields"
        >
          <Input type="url" id="feedUrl" name="feedUrl" required />
        </Field>
      )}

      {sourceType === 'json' && (
        <>
          <Field
            label="JSON / JS / TS file"
            htmlFor="jsonFile"
            hint="A .json, .js, or .ts file containing (or exporting) an array of products. File content is only ever parsed as data, never executed."
          >
            <Input type="file" id="jsonFile" name="jsonFile" accept=".json,.js,.ts" />
          </Field>
          <Field label="…or paste JSON" htmlFor="jsonText">
            <Textarea id="jsonText" name="jsonText" rows={8} />
          </Field>
        </>
      )}

      {sourceType === 'spreadsheet' && (
        <Field
          label="Spreadsheet file"
          htmlFor="spreadsheetFile"
          hint="A .csv or .xlsx file. Required columns: name (or title) and price. Product URL, slug, image, and stock are optional."
        >
          <Input type="file" id="spreadsheetFile" name="spreadsheetFile" accept=".csv,.xlsx" required />
        </Field>
      )}

      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.message && <Alert tone="success">{state.message}</Alert>}

      <Button type="submit" disabled={isPending}>
        {isPending ? 'Importing…' : 'Import products'}
      </Button>
    </form>
  );
}
