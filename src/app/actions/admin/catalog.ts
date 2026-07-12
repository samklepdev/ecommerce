'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { getContainer } from '@/composition/container';
import { requireAdmin } from '@/app/lib/session';

const CreateSupplierSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  notes: z.string().optional(),
});

export async function createSupplierAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const parsed = CreateSupplierSchema.safeParse({
    name: formData.get('name'),
    url: formData.get('url'),
    notes: formData.get('notes') || undefined,
  });
  if (!parsed.success) return;

  const { createSupplier } = getContainer();
  await createSupplier.execute(parsed.data);
  revalidatePath('/admin/products');
}

const CreateProductSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  sku: z.string().min(1),
  unitAmountMinor: z.coerce.number().int().positive(),
  currency: z.string().length(3),
  supplierId: z.string().min(1),
  supplierProductUrl: z.string().url(),
  costAmountMinor: z.coerce.number().int().positive(),
  costCurrency: z.string().length(3),
});

/** One combined form: product + its first variant + its preferred supplier offer. */
export async function createProductWithOfferAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const parsed = CreateProductSchema.safeParse({
    slug: formData.get('slug'),
    name: formData.get('name'),
    description: formData.get('description') || undefined,
    sku: formData.get('sku'),
    unitAmountMinor: formData.get('unitAmountMinor'),
    currency: formData.get('currency') || 'USD',
    supplierId: formData.get('supplierId'),
    supplierProductUrl: formData.get('supplierProductUrl'),
    costAmountMinor: formData.get('costAmountMinor'),
    costCurrency: formData.get('costCurrency') || 'USD',
  });
  if (!parsed.success) return;

  const { createProduct, createProductVariant, createSupplierOffer } = getContainer();

  const product = await createProduct.execute({
    slug: parsed.data.slug,
    name: parsed.data.name,
    description: parsed.data.description ?? null,
  });

  const variant = await createProductVariant.execute({
    productId: product.id,
    sku: parsed.data.sku,
    name: 'Default',
    unitAmountMinor: parsed.data.unitAmountMinor,
    currency: parsed.data.currency,
  });

  await createSupplierOffer.execute({
    variantId: variant.id,
    supplierId: parsed.data.supplierId,
    supplierProductUrl: parsed.data.supplierProductUrl,
    costAmountMinor: parsed.data.costAmountMinor,
    costCurrency: parsed.data.costCurrency,
    isPreferred: true,
  });

  revalidatePath('/admin/products');
  revalidatePath('/products');
}

const SyncSupplierOfferSchema = z.object({
  supplierOfferId: z.string().min(1),
});

export async function syncSupplierOfferAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const parsed = SyncSupplierOfferSchema.safeParse({
    supplierOfferId: formData.get('supplierOfferId'),
  });
  if (!parsed.success) return;

  const { syncSupplierOffer } = getContainer();
  await syncSupplierOffer.execute(parsed.data);
  revalidatePath('/admin/products');
  revalidatePath('/products');
}

const SetAutoSyncSchema = z.object({
  offerId: z.string().min(1),
  enabled: z.enum(['true', 'false']).transform((v) => v === 'true'),
});

export async function setAutoSyncEnabledAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const parsed = SetAutoSyncSchema.safeParse({
    offerId: formData.get('offerId'),
    enabled: formData.get('enabled'),
  });
  if (!parsed.success) return;

  const { setSupplierOfferAutoSync } = getContainer();
  await setSupplierOfferAutoSync.execute(parsed.data);
  revalidatePath('/admin/products');
}

const ImportFeedSchema = z.object({
  supplierId: z.string().min(1),
  feedUrl: z.string().url(),
});

export interface ImportFeedActionResult {
  message?: string;
  error?: string;
}

export async function importProductsFromFeedAction(
  _prevState: ImportFeedActionResult | undefined,
  formData: FormData,
): Promise<ImportFeedActionResult> {
  await requireAdmin();
  const parsed = ImportFeedSchema.safeParse({
    supplierId: formData.get('supplierId'),
    feedUrl: formData.get('feedUrl'),
  });
  if (!parsed.success) return { error: 'Select a supplier and enter a valid feed URL.' };

  const { importProductsFromFeed } = getContainer();
  const result = await importProductsFromFeed.execute(parsed.data);

  revalidatePath('/admin/products');
  revalidatePath('/products');

  if (result.status !== 'ok') {
    return { error: result.message ?? 'Import failed.' };
  }
  return { message: `Imported ${result.created}, skipped ${result.skipped} already in the catalog.` };
}
