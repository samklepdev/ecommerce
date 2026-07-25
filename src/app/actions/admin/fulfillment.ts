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
  const admin = await requireAdmin();
  const parsed = MarkOrderedSchema.safeParse({
    supplierOrderId: formData.get('supplierOrderId'),
    reference: formData.get('reference'),
  });
  if (!parsed.success) return;

  const { markSupplierOrderOrdered, recordAuditLogEntry } = getContainer();
  await markSupplierOrderOrdered.execute(parsed.data);

  await recordAuditLogEntry.execute({
    actorUserId: admin.id,
    actorEmail: admin.email,
    action: 'supplier_order.marked_ordered',
    targetType: 'supplier_order',
    targetId: parsed.data.supplierOrderId,
    metadata: { reference: parsed.data.reference },
  });

  revalidatePath('/admin/fulfillment');
}

const MarkShippedSchema = z.object({
  supplierOrderId: z.string().min(1),
  orderId: z.string().min(1),
  trackingNumber: z.string().min(1),
  carrier: z.string().optional(),
});

export async function markSupplierOrderShippedAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const parsed = MarkShippedSchema.safeParse({
    supplierOrderId: formData.get('supplierOrderId'),
    orderId: formData.get('orderId'),
    trackingNumber: formData.get('trackingNumber'),
    carrier: formData.get('carrier') || undefined,
  });
  if (!parsed.success) return;

  const { markSupplierOrderShipped, recordAuditLogEntry } = getContainer();
  await markSupplierOrderShipped.execute(parsed.data);

  await recordAuditLogEntry.execute({
    actorUserId: admin.id,
    actorEmail: admin.email,
    action: 'supplier_order.marked_shipped',
    targetType: 'supplier_order',
    targetId: parsed.data.supplierOrderId,
    metadata: {
      orderId: parsed.data.orderId,
      trackingNumber: parsed.data.trackingNumber,
      carrier: parsed.data.carrier ?? null,
    },
  });

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

const BulkMarkOrderedSchema = z.object({
  supplierOrderIds: z.array(z.string().min(1)).min(1),
  orderId: z.string().min(1),
  reference: z.string().min(1),
});

export interface BulkMarkSupplierOrdersOrderedActionResult {
  message?: string;
  error?: string;
}

export async function bulkMarkSupplierOrdersOrderedAction(
  _prevState: BulkMarkSupplierOrdersOrderedActionResult | undefined,
  formData: FormData,
): Promise<BulkMarkSupplierOrdersOrderedActionResult> {
  const admin = await requireAdmin();
  const parsed = BulkMarkOrderedSchema.safeParse({
    supplierOrderIds: formData.getAll('supplierOrderIds'),
    orderId: formData.get('orderId'),
    reference: formData.get('reference'),
  });
  if (!parsed.success) return { error: 'Select at least one supplier order and enter a reference.' };

  const { bulkMarkSupplierOrdersOrdered, recordAuditLogEntry } = getContainer();
  const result = await bulkMarkSupplierOrdersOrdered.execute(parsed.data);

  await recordAuditLogEntry.execute({
    actorUserId: admin.id,
    actorEmail: admin.email,
    action: 'supplier_order.bulk_marked_ordered',
    targetType: 'supplier_order',
    targetId: parsed.data.supplierOrderIds.join(','),
    metadata: { orderId: parsed.data.orderId, reference: parsed.data.reference, ...result },
  });

  revalidatePath('/admin/fulfillment');

  if (result.failed > 0) {
    return { error: `Marked ${result.updated} ordered, but ${result.failed} could not be updated.` };
  }
  return { message: `Marked ${result.updated} supplier order${result.updated === 1 ? '' : 's'} ordered.` };
}

const BulkMarkShippedSchema = z.object({
  supplierOrderIds: z.array(z.string().min(1)).min(1),
  orderId: z.string().min(1),
  trackingNumber: z.string().min(1),
  carrier: z.string().optional(),
});

export interface BulkMarkSupplierOrdersShippedActionResult {
  message?: string;
  error?: string;
}

export async function bulkMarkSupplierOrdersShippedAction(
  _prevState: BulkMarkSupplierOrdersShippedActionResult | undefined,
  formData: FormData,
): Promise<BulkMarkSupplierOrdersShippedActionResult> {
  const admin = await requireAdmin();
  const parsed = BulkMarkShippedSchema.safeParse({
    supplierOrderIds: formData.getAll('supplierOrderIds'),
    orderId: formData.get('orderId'),
    trackingNumber: formData.get('trackingNumber'),
    carrier: formData.get('carrier') || undefined,
  });
  if (!parsed.success) return { error: 'Select at least one supplier order and enter a tracking number.' };

  const { bulkMarkSupplierOrdersShipped, recordAuditLogEntry } = getContainer();
  const result = await bulkMarkSupplierOrdersShipped.execute(parsed.data);

  await recordAuditLogEntry.execute({
    actorUserId: admin.id,
    actorEmail: admin.email,
    action: 'supplier_order.bulk_marked_shipped',
    targetType: 'supplier_order',
    targetId: parsed.data.supplierOrderIds.join(','),
    metadata: {
      orderId: parsed.data.orderId,
      trackingNumber: parsed.data.trackingNumber,
      carrier: parsed.data.carrier ?? null,
      ...result,
    },
  });

  revalidatePath('/admin/fulfillment');

  if (result.failed > 0) {
    return { error: `Marked ${result.updated} shipped, but ${result.failed} could not be updated.` };
  }
  return { message: `Marked ${result.updated} supplier order${result.updated === 1 ? '' : 's'} shipped.` };
}

const BulkCancelSchema = z.object({
  supplierOrderIds: z.array(z.string().min(1)).min(1),
  orderId: z.string().min(1),
});

export interface BulkCancelSupplierOrdersActionResult {
  message?: string;
  error?: string;
}

export async function bulkCancelSupplierOrdersAction(
  _prevState: BulkCancelSupplierOrdersActionResult | undefined,
  formData: FormData,
): Promise<BulkCancelSupplierOrdersActionResult> {
  const admin = await requireAdmin();
  const parsed = BulkCancelSchema.safeParse({
    supplierOrderIds: formData.getAll('supplierOrderIds'),
    orderId: formData.get('orderId'),
  });
  if (!parsed.success) return { error: 'Select at least one supplier order to cancel.' };

  const { bulkCancelSupplierOrders, recordAuditLogEntry } = getContainer();
  const result = await bulkCancelSupplierOrders.execute(parsed.data);

  await recordAuditLogEntry.execute({
    actorUserId: admin.id,
    actorEmail: admin.email,
    action: 'supplier_order.bulk_cancelled',
    targetType: 'supplier_order',
    targetId: parsed.data.supplierOrderIds.join(','),
    metadata: { orderId: parsed.data.orderId, ...result },
  });

  revalidatePath('/admin/fulfillment');

  if (result.failed > 0) {
    return { error: `Cancelled ${result.updated}, but ${result.failed} could not be cancelled.` };
  }
  return { message: `Cancelled ${result.updated} supplier order${result.updated === 1 ? '' : 's'}.` };
}
