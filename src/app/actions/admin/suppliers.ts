'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { getContainer } from '@/composition/container';
import { isErr } from '@/shared/domain/result';
import { requireAdmin, requireRecentAdminAuth } from '@/app/lib/session';
import { httpUrlSchema } from '@/app/lib/url-schema';

const UpdateSupplierSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  url: httpUrlSchema,
  notes: z.string().optional(),
});

export interface UpdateSupplierActionResult {
  message?: string;
  error?: string;
}

export async function updateSupplierAction(
  _prevState: UpdateSupplierActionResult | undefined,
  formData: FormData,
): Promise<UpdateSupplierActionResult> {
  const admin = await requireAdmin();
  const parsed = UpdateSupplierSchema.safeParse({
    id: formData.get('id'),
    name: formData.get('name'),
    url: formData.get('url'),
    notes: formData.get('notes') || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Enter a name and a valid URL.' };
  }

  const { updateSupplier, recordAuditLogEntry } = getContainer();
  await updateSupplier.execute({
    id: parsed.data.id,
    name: parsed.data.name,
    url: parsed.data.url,
    notes: parsed.data.notes ?? null,
  });

  // A supplier's URL is where fulfilment goes to buy. Changing it silently
  // was the gap: deletes were audited, edits weren't, so the one change that
  // redirects real purchasing left no trace.
  await recordAuditLogEntry.execute({
    actorUserId: admin.id,
    actorEmail: admin.email,
    action: 'supplier.updated',
    targetType: 'supplier',
    targetId: parsed.data.id,
    metadata: { name: parsed.data.name, url: parsed.data.url },
  });

  revalidatePath('/admin/suppliers');
  revalidatePath('/admin/products');
  return { message: 'Supplier updated.' };
}

const SetSupplierActiveSchema = z.object({
  id: z.string().min(1),
  isActive: z.enum(['true', 'false']),
});

export interface SetSupplierActiveActionResult {
  message?: string;
  error?: string;
}

/** Deactivating drops the supplier out of "source from" dropdowns (new
 * product, new supplier offer) without touching existing offers/orders. */
export async function setSupplierActiveAction(
  _prevState: SetSupplierActiveActionResult | undefined,
  formData: FormData,
): Promise<SetSupplierActiveActionResult> {
  const admin = await requireAdmin();
  const parsed = SetSupplierActiveSchema.safeParse({
    id: formData.get('id'),
    isActive: formData.get('isActive'),
  });
  if (!parsed.success) return { error: 'Missing supplier.' };

  const { setSupplierActive, recordAuditLogEntry } = getContainer();
  const isActive = parsed.data.isActive === 'true';
  await setSupplierActive.execute({ id: parsed.data.id, isActive });

  await recordAuditLogEntry.execute({
    actorUserId: admin.id,
    actorEmail: admin.email,
    action: isActive ? 'supplier.reactivated' : 'supplier.deactivated',
    targetType: 'supplier',
    targetId: parsed.data.id,
    metadata: {},
  });

  revalidatePath('/admin/suppliers');
  revalidatePath('/admin/products');
  return { message: isActive ? 'Supplier reactivated.' : 'Supplier deactivated.' };
}

const DeleteSupplierSchema = z.object({
  id: z.string().min(1),
});

export interface DeleteSupplierActionResult {
  message?: string;
  error?: string;
}

/**
 * Removes a supplier for good. Refused while any catalog offer or supplier
 * order still points at it — deactivating is the reversible option, and
 * purchase history is never deletable.
 */
export async function deleteSupplierAction(
  _prevState: DeleteSupplierActionResult | undefined,
  formData: FormData,
): Promise<DeleteSupplierActionResult> {
  // Destructive: refuses unless the password was typed recently.
  const sudo = await requireRecentAdminAuth();
  if (!sudo.ok) return { error: sudo.reason };
  const admin = sudo.admin;
  const parsed = DeleteSupplierSchema.safeParse({ id: formData.get('id') });
  if (!parsed.success) return { error: 'Missing supplier.' };

  const { deleteSupplier, recordAuditLogEntry } = getContainer();
  const result = await deleteSupplier.execute({ id: parsed.data.id });

  if (isErr(result)) {
    if (result.error.code === 'not_found') return { error: 'That supplier no longer exists.' };
    const { offerCount, supplierOrderCount } = result.error;
    const holding = [
      offerCount > 0 && `${offerCount} product offer${offerCount === 1 ? '' : 's'}`,
      supplierOrderCount > 0 &&
        `${supplierOrderCount} supplier order${supplierOrderCount === 1 ? '' : 's'}`,
    ]
      .filter((part): part is string => typeof part === 'string')
      .join(' and ');
    return {
      error: `Can't delete this supplier — ${holding} still reference it. Deactivate it instead.`,
    };
  }

  await recordAuditLogEntry.execute({
    actorUserId: admin.id,
    actorEmail: admin.email,
    action: 'supplier.deleted',
    targetType: 'supplier',
    targetId: parsed.data.id,
  });

  revalidatePath('/admin/suppliers');
  revalidatePath('/admin/products');
  return { message: 'Supplier deleted.' };
}
