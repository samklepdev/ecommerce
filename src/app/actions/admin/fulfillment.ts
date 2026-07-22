'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { getContainer } from '@/composition/container';
import { requireAdmin } from '@/app/lib/session';

const MarkOrderedSchema = z.object({
  supplierOrderId: z.string().min(1),
  reference: z.string().min(1),
});

export async function markSupplierOrderOrderedAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const parsed = MarkOrderedSchema.safeParse({
    supplierOrderId: formData.get('supplierOrderId'),
    reference: formData.get('reference'),
  });
  if (!parsed.success) return;

  const { markSupplierOrderOrdered } = getContainer();
  await markSupplierOrderOrdered.execute(parsed.data);
  revalidatePath('/admin/fulfillment');
}

const MarkShippedSchema = z.object({
  supplierOrderId: z.string().min(1),
  orderId: z.string().min(1),
  trackingNumber: z.string().min(1),
  carrier: z.string().optional(),
});

export async function markSupplierOrderShippedAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const parsed = MarkShippedSchema.safeParse({
    supplierOrderId: formData.get('supplierOrderId'),
    orderId: formData.get('orderId'),
    trackingNumber: formData.get('trackingNumber'),
    carrier: formData.get('carrier') || undefined,
  });
  if (!parsed.success) return;

  const { markSupplierOrderShipped } = getContainer();
  await markSupplierOrderShipped.execute(parsed.data);
  revalidatePath('/admin/fulfillment');
}

const CancelSupplierOrderSchema = z.object({
  supplierOrderId: z.string().min(1),
  orderId: z.string().min(1),
});

export async function cancelSupplierOrderAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const parsed = CancelSupplierOrderSchema.safeParse({
    supplierOrderId: formData.get('supplierOrderId'),
    orderId: formData.get('orderId'),
  });
  if (!parsed.success) return;

  const { cancelSupplierOrder, recordAuditLogEntry } = getContainer();
  await cancelSupplierOrder.execute(parsed.data);

  await recordAuditLogEntry.execute({
    actorUserId: admin.id,
    actorEmail: admin.email,
    action: 'supplier_order.cancelled',
    targetType: 'supplier_order',
    targetId: parsed.data.supplierOrderId,
    metadata: { orderId: parsed.data.orderId },
  });

  revalidatePath('/admin/fulfillment');
}

const UpdateReferenceSchema = z.object({
  supplierOrderId: z.string().min(1),
  reference: z.string().min(1),
});

export interface UpdateSupplierOrderReferenceActionResult {
  message?: string;
  error?: string;
}

export async function updateSupplierOrderReferenceAction(
  _prevState: UpdateSupplierOrderReferenceActionResult | undefined,
  formData: FormData,
): Promise<UpdateSupplierOrderReferenceActionResult> {
  await requireAdmin();
  const parsed = UpdateReferenceSchema.safeParse({
    supplierOrderId: formData.get('supplierOrderId'),
    reference: formData.get('reference'),
  });
  if (!parsed.success) return { error: 'Enter a reference.' };

  const { updateSupplierOrderReference } = getContainer();
  await updateSupplierOrderReference.execute(parsed.data);
  revalidatePath('/admin/fulfillment');
  return { message: 'Reference updated.' };
}

const UpdateTrackingNumberSchema = z.object({
  supplierOrderId: z.string().min(1),
  trackingNumber: z.string().min(1),
  carrier: z.string().optional(),
});

export interface UpdateSupplierOrderTrackingNumberActionResult {
  message?: string;
  error?: string;
}

export async function updateSupplierOrderTrackingNumberAction(
  _prevState: UpdateSupplierOrderTrackingNumberActionResult | undefined,
  formData: FormData,
): Promise<UpdateSupplierOrderTrackingNumberActionResult> {
  await requireAdmin();
  const parsed = UpdateTrackingNumberSchema.safeParse({
    supplierOrderId: formData.get('supplierOrderId'),
    trackingNumber: formData.get('trackingNumber'),
    carrier: formData.get('carrier') || undefined,
  });
  if (!parsed.success) return { error: 'Enter a tracking number.' };

  const { updateSupplierOrderTrackingNumber } = getContainer();
  await updateSupplierOrderTrackingNumber.execute(parsed.data);
  revalidatePath('/admin/fulfillment');
  return { message: 'Tracking number updated.' };
}
