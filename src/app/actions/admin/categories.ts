'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { getContainer } from '@/composition/container';
import { isErr } from '@/shared/domain/result';
import { requireAdmin, requireRecentAdminAuth } from '@/app/lib/session';

export interface CategoryActionResult {
  message?: string;
  error?: string;
}

/** Every category write invalidates both surfaces: the admin list, and the
 * storefront, whose filter dropdown and product URLs are built from these. */
function revalidateCategorySurfaces(): void {
  revalidatePath('/admin/categories');
  revalidatePath('/admin/products');
  revalidatePath('/products');
}

const CreateSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(500).optional(),
});

export async function createCategoryAction(
  _prevState: CategoryActionResult | undefined,
  formData: FormData,
): Promise<CategoryActionResult> {
  const admin = await requireAdmin();
  const parsed = CreateSchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description') || undefined,
  });
  if (!parsed.success) return { error: 'Enter a category name (80 characters or fewer).' };

  const { createCategory, recordAuditLogEntry } = getContainer();
  const result = await createCategory.execute(parsed.data);
  if (isErr(result)) {
    return {
      error:
        result.error.code === 'name_taken'
          ? 'There is already a category with that name.'
          : "That name has no usable URL form — it needs at least one letter or number.",
    };
  }

  await recordAuditLogEntry.execute({
    actorUserId: admin.id,
    actorEmail: admin.email,
    action: 'category.created',
    targetType: 'category',
    targetId: result.value.id,
    metadata: { name: result.value.name, slug: result.value.slug.value },
  });

  revalidateCategorySurfaces();
  return { message: `Created “${result.value.name}”.` };
}

const UpdateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  description: z.string().max(500).optional(),
});

export async function updateCategoryAction(
  _prevState: CategoryActionResult | undefined,
  formData: FormData,
): Promise<CategoryActionResult> {
  const admin = await requireAdmin();
  const parsed = UpdateSchema.safeParse({
    id: formData.get('id'),
    name: formData.get('name'),
    description: formData.get('description') || undefined,
  });
  if (!parsed.success) return { error: 'Enter a category name (80 characters or fewer).' };

  const { updateCategory, recordAuditLogEntry } = getContainer();
  const result = await updateCategory.execute(parsed.data);
  if (isErr(result)) {
    return {
      error:
        result.error.code === 'name_taken'
          ? 'Another category already has that name.'
          : 'That category no longer exists.',
    };
  }

  await recordAuditLogEntry.execute({
    actorUserId: admin.id,
    actorEmail: admin.email,
    action: 'category.updated',
    targetType: 'category',
    targetId: parsed.data.id,
    metadata: { name: result.value.name },
  });

  revalidateCategorySurfaces();
  // Worth saying: the slug is deliberately not rewritten, so existing links
  // keep resolving. Nobody would guess that from the form.
  return { message: `Renamed to “${result.value.name}”. Its link stays /products?category=${result.value.slug.value}.` };
}

const DeleteSchema = z.object({ id: z.string().min(1) });

export async function deleteCategoryAction(
  _prevState: CategoryActionResult | undefined,
  formData: FormData,
): Promise<CategoryActionResult> {
  // Destructive: refuses unless the password was typed recently.
  const sudo = await requireRecentAdminAuth();
  if (!sudo.ok) return { error: sudo.reason };
  const admin = sudo.admin;
  const parsed = DeleteSchema.safeParse({ id: formData.get('id') });
  if (!parsed.success) return { error: 'Missing category.' };

  const { deleteCategory, recordAuditLogEntry } = getContainer();
  const result = await deleteCategory.execute(parsed.data);
  if (isErr(result)) return { error: 'That category no longer exists.' };

  await recordAuditLogEntry.execute({
    actorUserId: admin.id,
    actorEmail: admin.email,
    action: 'category.deleted',
    targetType: 'category',
    targetId: parsed.data.id,
    metadata: { uncategorized: result.value.uncategorized },
  });

  revalidateCategorySurfaces();
  const { uncategorized } = result.value;
  return {
    message:
      uncategorized === 0
        ? 'Category deleted.'
        : `Category deleted. ${uncategorized} product${uncategorized === 1 ? ' is' : 's are'} now uncategorized.`,
  };
}

const MergeSchema = z.object({
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
});

export async function mergeCategoriesAction(
  _prevState: CategoryActionResult | undefined,
  formData: FormData,
): Promise<CategoryActionResult> {
  const admin = await requireAdmin();
  const parsed = MergeSchema.safeParse({
    sourceId: formData.get('sourceId'),
    targetId: formData.get('targetId'),
  });
  if (!parsed.success) return { error: 'Pick a category to merge into.' };

  const { mergeCategories, recordAuditLogEntry } = getContainer();
  const result = await mergeCategories.execute(parsed.data);
  if (isErr(result)) {
    return {
      error:
        result.error.code === 'same_category'
          ? "A category can't be merged into itself."
          : 'One of those categories no longer exists.',
    };
  }

  await recordAuditLogEntry.execute({
    actorUserId: admin.id,
    actorEmail: admin.email,
    action: 'category.merged',
    targetType: 'category',
    targetId: parsed.data.sourceId,
    metadata: { intoCategoryId: parsed.data.targetId, moved: result.value.moved },
  });

  revalidateCategorySurfaces();
  const { moved, targetName } = result.value;
  return {
    message: `Merged into “${targetName}” — ${moved} product${moved === 1 ? '' : 's'} moved.`,
  };
}
