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

export interface CreateSupplierActionResult {
  message?: string;
  error?: string;
}

export async function createSupplierAction(
  _prevState: CreateSupplierActionResult | undefined,
  formData: FormData,
): Promise<CreateSupplierActionResult> {
  await requireAdmin();
  const parsed = CreateSupplierSchema.safeParse({
    name: formData.get('name'),
    url: formData.get('url'),
    notes: formData.get('notes') || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Enter a name and a valid URL.' };
  }

  const { createSupplier } = getContainer();
  const supplier = await createSupplier.execute(parsed.data);
  revalidatePath('/admin/products');
  return { message: `Added supplier "${supplier.name}".` };
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

export interface CreateProductActionResult {
  message?: string;
  error?: string;
}

/** One combined form: product + its first variant + its preferred supplier offer. */
export async function createProductWithOfferAction(
  _prevState: CreateProductActionResult | undefined,
  formData: FormData,
): Promise<CreateProductActionResult> {
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
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Fill in all required fields.' };
  }

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
  });

  revalidatePath('/admin/products');
  revalidatePath('/products');
  return { message: `Added product "${product.name}".` };
}

const MAX_FEED_JSON_BYTES = 5 * 1024 * 1024;

const ImportFeedSchema = z
  .discriminatedUnion('sourceType', [
    z.object({
      sourceType: z.literal('url'),
      supplierId: z.string().min(1),
      feedUrl: z.string().url(),
      queryParams: z.string().optional(),
    }),
    z.object({
      sourceType: z.literal('json'),
      supplierId: z.string().min(1),
      jsonFile: z
        .instanceof(File)
        .refine((f) => f.size <= MAX_FEED_JSON_BYTES, 'The file must be 5MB or smaller.')
        .optional(),
      jsonText: z.string().optional(),
    }),
    z.object({
      sourceType: z.literal('spreadsheet'),
      supplierId: z.string().min(1),
      spreadsheetFile: z
        .instanceof(File)
        .refine((f) => f.size > 0, 'Choose a .csv or .xlsx file.')
        .refine((f) => f.size <= MAX_FEED_JSON_BYTES, 'The file must be 5MB or smaller.'),
    }),
  ])
  .refine(
    (data) =>
      data.sourceType !== 'json' ||
      (data.jsonFile && data.jsonFile.size > 0) ||
      (data.jsonText ?? '').trim() !== '',
    { message: 'Choose a .json, .js, or .ts file, or paste JSON.' },
  );

export interface ImportFeedActionResult {
  message?: string;
  error?: string;
}

export async function importProductsFromFeedAction(
  _prevState: ImportFeedActionResult | undefined,
  formData: FormData,
): Promise<ImportFeedActionResult> {
  await requireAdmin();
  const jsonFile = formData.get('jsonFile');
  const spreadsheetFile = formData.get('spreadsheetFile');
  const parsed = ImportFeedSchema.safeParse({
    sourceType: formData.get('sourceType'),
    supplierId: formData.get('supplierId'),
    feedUrl: formData.get('feedUrl') || undefined,
    queryParams: formData.get('queryParams') || undefined,
    jsonFile: jsonFile instanceof File && jsonFile.size > 0 ? jsonFile : undefined,
    jsonText: formData.get('jsonText') || undefined,
    spreadsheetFile:
      spreadsheetFile instanceof File && spreadsheetFile.size > 0 ? spreadsheetFile : undefined,
  });
  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ??
        'Select a supplier and either a valid feed URL or a file to import.',
    };
  }

  const { importProductsFromFeed } = getContainer();
  const result = await importProductsFromFeed.execute(
    parsed.data.sourceType === 'url'
      ? {
          supplierId: parsed.data.supplierId,
          source: 'url',
          feedUrl: parsed.data.feedUrl,
          queryParams: parsed.data.queryParams,
        }
      : parsed.data.sourceType === 'json'
        ? {
            supplierId: parsed.data.supplierId,
            source: 'json',
            rawJson:
              parsed.data.jsonFile && parsed.data.jsonFile.size > 0
                ? await parsed.data.jsonFile.text()
                : (parsed.data.jsonText ?? ''),
          }
        : {
            supplierId: parsed.data.supplierId,
            source: 'spreadsheet',
            fileBuffer: Buffer.from(await parsed.data.spreadsheetFile.arrayBuffer()),
          },
  );

  revalidatePath('/admin/products');
  revalidatePath('/products');

  if (result.status !== 'ok') {
    return { error: result.message ?? 'Import failed.' };
  }
  return { message: `Imported ${result.created}, skipped ${result.skipped} already in the catalog.` };
}

const DeleteProductsSchema = z.object({
  productIds: z.array(z.string().min(1)).min(1),
});

export interface DeleteProductsActionResult {
  message?: string;
  error?: string;
}

export async function deleteProductsAction(
  _prevState: DeleteProductsActionResult | undefined,
  formData: FormData,
): Promise<DeleteProductsActionResult> {
  await requireAdmin();
  const parsed = DeleteProductsSchema.safeParse({
    productIds: formData.getAll('productIds'),
  });
  if (!parsed.success) return { error: 'Select at least one product to delete.' };

  const { deleteProducts } = getContainer();
  const result = await deleteProducts.execute(parsed.data);

  revalidatePath('/admin/products');
  revalidatePath('/products');

  if (result.failed > 0) {
    return {
      error: `Deleted ${result.deleted}, but ${result.failed} could not be deleted (likely already part of an order).`,
    };
  }
  return { message: `Deleted ${result.deleted} product${result.deleted === 1 ? '' : 's'}.` };
}

const PublishProductsSchema = z.object({
  productIds: z.array(z.string().min(1)).min(1),
});

export interface PublishProductsActionResult {
  message?: string;
  error?: string;
}

export async function publishProductsAction(
  _prevState: PublishProductsActionResult | undefined,
  formData: FormData,
): Promise<PublishProductsActionResult> {
  await requireAdmin();
  const parsed = PublishProductsSchema.safeParse({
    productIds: formData.getAll('productIds'),
  });
  if (!parsed.success) return { error: 'Select at least one product to publish.' };

  const { publishProducts } = getContainer();
  const result = await publishProducts.execute(parsed.data);

  revalidatePath('/admin/products');
  revalidatePath('/products');

  if (result.failed > 0) {
    return { error: `Published ${result.published}, but ${result.failed} could not be published.` };
  }
  return { message: `Published ${result.published} product${result.published === 1 ? '' : 's'}.` };
}

const UnpublishProductsSchema = z.object({
  productIds: z.array(z.string().min(1)).min(1),
});

export interface UnpublishProductsActionResult {
  message?: string;
  error?: string;
}

export async function unpublishProductsAction(
  _prevState: UnpublishProductsActionResult | undefined,
  formData: FormData,
): Promise<UnpublishProductsActionResult> {
  await requireAdmin();
  const parsed = UnpublishProductsSchema.safeParse({
    productIds: formData.getAll('productIds'),
  });
  if (!parsed.success) return { error: 'Select at least one product to unpublish.' };

  const { unpublishProducts } = getContainer();
  const result = await unpublishProducts.execute(parsed.data);

  revalidatePath('/admin/products');
  revalidatePath('/products');

  if (result.failed > 0) {
    return {
      error: `Unpublished ${result.unpublished}, but ${result.failed} could not be unpublished.`,
    };
  }
  return {
    message: `Unpublished ${result.unpublished} product${result.unpublished === 1 ? '' : 's'}.`,
  };
}

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

const AddProductImagesSchema = z.object({
  productId: z.string().min(1),
  images: z
    .array(
      z
        .instanceof(File)
        .refine((f) => f.size > 0)
        .refine((f) => f.size <= MAX_UPLOAD_BYTES, 'Each image must be 8MB or smaller.'),
    )
    .min(1, 'Choose at least one image file.'),
});

export interface AddProductImagesActionResult {
  message?: string;
  error?: string;
}

export async function addProductImagesAction(
  _prevState: AddProductImagesActionResult | undefined,
  formData: FormData,
): Promise<AddProductImagesActionResult> {
  await requireAdmin();
  const parsed = AddProductImagesSchema.safeParse({
    productId: formData.get('productId'),
    images: formData.getAll('images').filter((f): f is File => f instanceof File && f.size > 0),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Choose at least one valid image file.' };
  }

  const { addProductImages } = getContainer();
  const files = await Promise.all(
    parsed.data.images.map(async (image) => ({
      buffer: Buffer.from(await image.arrayBuffer()),
      contentType: image.type,
    })),
  );
  const result = await addProductImages.execute({ productId: parsed.data.productId, files });

  revalidatePath('/admin/products');
  revalidatePath('/products');

  if (result.failed > 0) {
    return {
      error: `Added ${result.added}, but ${result.failed} file${result.failed === 1 ? '' : 's'} had an unrecognized image type.`,
    };
  }
  return { message: `Added ${result.added} image${result.added === 1 ? '' : 's'}.` };
}

const RemoveProductImageSchema = z.object({
  imageId: z.string().min(1),
});

export interface RemoveProductImageActionResult {
  message?: string;
  error?: string;
}

export async function removeProductImageAction(
  _prevState: RemoveProductImageActionResult | undefined,
  formData: FormData,
): Promise<RemoveProductImageActionResult> {
  await requireAdmin();
  const parsed = RemoveProductImageSchema.safeParse({ imageId: formData.get('imageId') });
  if (!parsed.success) return { error: 'Missing image to remove.' };

  const { removeProductImage } = getContainer();
  await removeProductImage.execute(parsed.data);

  revalidatePath('/admin/products');
  revalidatePath('/products');

  return { message: 'Image removed.' };
}

const RemovePrimaryProductImageSchema = z.object({
  productId: z.string().min(1),
});

export interface RemovePrimaryProductImageActionResult {
  message?: string;
  error?: string;
}

export async function removePrimaryProductImageAction(
  _prevState: RemovePrimaryProductImageActionResult | undefined,
  formData: FormData,
): Promise<RemovePrimaryProductImageActionResult> {
  await requireAdmin();
  const parsed = RemovePrimaryProductImageSchema.safeParse({
    productId: formData.get('productId'),
  });
  if (!parsed.success) return { error: 'Missing product.' };

  const { removePrimaryProductImage } = getContainer();
  await removePrimaryProductImage.execute(parsed.data);

  revalidatePath('/admin/products');
  revalidatePath('/products');

  return { message: 'Image removed.' };
}

const ExtractProductFromUrlSchema = z.object({
  url: z.string().url(),
});

export interface ExtractProductFromUrlActionResult {
  error?: string;
  text?: string;
  guessedName?: string | null;
  guessedDescription?: string | null;
  guessedImageUrl?: string | null;
  guessedPriceMinor?: number | null;
  guessedCurrency?: string | null;
}

export async function extractProductFromUrlAction(
  _prevState: ExtractProductFromUrlActionResult | undefined,
  formData: FormData,
): Promise<ExtractProductFromUrlActionResult> {
  await requireAdmin();
  const parsed = ExtractProductFromUrlSchema.safeParse({ url: formData.get('url') });
  if (!parsed.success) return { error: 'Enter a valid URL.' };

  const { extractProductFromUrl } = getContainer();
  const result = await extractProductFromUrl.execute(parsed.data);

  if (result.status !== 'ok') {
    return { error: result.message };
  }

  const { text, guessedName, guessedDescription, guessedImageUrl, guessedPriceMinor, guessedCurrency } =
    result;
  return { text, guessedName, guessedDescription, guessedImageUrl, guessedPriceMinor, guessedCurrency };
}
