'use client';

import { useActionState, useEffect, useRef } from 'react';

import {
  createProductWithOfferAction,
  extractProductFromUrlAction,
  type CreateProductActionResult,
  type ExtractProductFromUrlActionResult,
} from '@/app/actions/admin/catalog';
import { Field } from '@/components/ui/Field';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { slugify } from '@/shared/domain/slugify';
import styles from './page.module.css';

interface Supplier {
  id: string;
  name: string;
}

/** Categories are rows now, so the UI picks from them rather than typing a
 * name and hoping it matches. */
interface CategoryOption {
  id: string;
  name: string;
}

interface AddProductFormProps {
  suppliers: Supplier[];
  categories: CategoryOption[];
  onSuccess?: () => void;
}

const initialState: CreateProductActionResult = {};
const extractInitialState: ExtractProductFromUrlActionResult = {};

export function AddProductForm({ suppliers, categories, onSuccess }: AddProductFormProps) {
  const [state, formAction, isPending] = useActionState(createProductWithOfferAction, initialState);
  const [extractState, extractFormAction, isExtractPending] = useActionState(
    extractProductFromUrlAction,
    extractInitialState,
  );
  const lastMessage = useRef<string | undefined>(undefined);

  const urlRef = useRef<HTMLInputElement>(null);
  const slugRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLInputElement>(null);
  const supplierProductUrlRef = useRef<HTMLInputElement>(null);
  const costAmountMinorRef = useRef<HTMLInputElement>(null);
  const costCurrencyRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.message && state.message !== lastMessage.current) onSuccess?.();
    lastMessage.current = state.message;
  }, [state.message, onSuccess]);

  // Imperative prefill on a fresh extraction result — refs, not controlled
  // state, so the rest of the form stays a plain uncontrolled server-action
  // form. Sell price is deliberately left untouched: cost is what the
  // source page showed, sell price is always the admin's own call.
  useEffect(() => {
    if (!extractState.text) return;

    if (extractState.guessedName) {
      if (nameRef.current) nameRef.current.value = extractState.guessedName;
      if (slugRef.current && !slugRef.current.value) {
        slugRef.current.value = slugify(extractState.guessedName);
      }
    }
    if (extractState.guessedDescription && descriptionRef.current) {
      descriptionRef.current.value = extractState.guessedDescription;
    }
    if (urlRef.current?.value && supplierProductUrlRef.current) {
      supplierProductUrlRef.current.value = urlRef.current.value;
    }
    if (extractState.guessedPriceMinor != null && costAmountMinorRef.current) {
      costAmountMinorRef.current.value = String(extractState.guessedPriceMinor);
    }
    if (extractState.guessedCurrency && costCurrencyRef.current) {
      costCurrencyRef.current.value = extractState.guessedCurrency;
    }
  }, [extractState]);

  return (
    <>
      <div className={styles.pasteUrlBox}>
        <form action={extractFormAction} className={styles.row}>
          <Field
            label="Paste a product URL"
            htmlFor="extractUrl"
            className={styles.rowField}
            hint="Fetches the page, strips the HTML, and best-effort-guesses name/price/description below — read the fetched text and fix anything it got wrong"
          >
            <Input type="url" id="extractUrl" name="url" ref={urlRef} />
          </Field>
          <Button type="submit" variant="secondary" disabled={isExtractPending}>
            {isExtractPending ? 'Fetching…' : 'Fetch & prefill'}
          </Button>
        </form>

        {extractState.error && <Alert tone="danger">{extractState.error}</Alert>}

        {extractState.text && (
          <details className={styles.fetchedTextDetails}>
            <summary>Fetched page text (for reference)</summary>
            {extractState.guessedImageUrl && (
              <p className={styles.fetchedImageNote}>
                Guessed image:{' '}
                <a href={extractState.guessedImageUrl} target="_blank" rel="noreferrer">
                  {extractState.guessedImageUrl}
                </a>{' '}
                — add it via the Images column after creating the product.
              </p>
            )}
            <Textarea readOnly rows={10} value={extractState.text} className={styles.fetchedTextArea} />
          </details>
        )}
      </div>

      <form action={formAction} className={styles.modalForm}>
        <div className={styles.row}>
          <Field label="Slug" htmlFor="slug" className={styles.rowField}>
            <Input type="text" id="slug" name="slug" ref={slugRef} required />
          </Field>
          <Field label="Name" htmlFor="name" className={styles.rowField}>
            <Input type="text" id="name" name="name" ref={nameRef} required />
          </Field>
        </div>
        <Field label="Description" htmlFor="description" hint="Optional">
          <Input type="text" id="description" name="description" ref={descriptionRef} />
        </Field>
        <Field label="Category" htmlFor="category" hint="Optional — used for the storefront filter">
          <Select id="category" name="categoryId" defaultValue="">
            <option value="">Uncategorized</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>

        <div className={styles.row}>
          <Field
            label="Sell price (minor units)"
            htmlFor="unitAmountMinor"
            hint="e.g. cents"
            className={styles.rowField}
          >
            <Input type="number" id="unitAmountMinor" name="unitAmountMinor" min={1} required />
          </Field>
          <Field label="Currency" htmlFor="currency" className={styles.rowField}>
            <Input type="text" id="currency" name="currency" defaultValue="USD" required />
          </Field>
        </div>

        <Field label="Supplier" htmlFor="supplierId">
          <Select id="supplierId" name="supplierId" required defaultValue="">
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
        <Field label="Supplier product URL" htmlFor="supplierProductUrl">
          <Input
            type="url"
            id="supplierProductUrl"
            name="supplierProductUrl"
            ref={supplierProductUrlRef}
            required
          />
        </Field>

        <div className={styles.row}>
          <Field label="Cost (minor units)" htmlFor="costAmountMinor" className={styles.rowField}>
            <Input
              type="number"
              id="costAmountMinor"
              name="costAmountMinor"
              ref={costAmountMinorRef}
              min={1}
              required
            />
          </Field>
          <Field label="Cost currency" htmlFor="costCurrency" className={styles.rowField}>
            <Input
              type="text"
              id="costCurrency"
              name="costCurrency"
              ref={costCurrencyRef}
              defaultValue="USD"
              required
            />
          </Field>
        </div>

        {state.error && <Alert tone="danger">{state.error}</Alert>}
        {state.message && <Alert tone="success">{state.message}</Alert>}

        <div className={styles.modalFooter}>
          <Button type="submit" disabled={isPending}>
            {isPending ? 'Adding…' : 'Add product'}
          </Button>
        </div>
      </form>
    </>
  );
}
