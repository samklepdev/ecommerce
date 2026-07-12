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
});

export async function markSupplierOrderShippedAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const parsed = MarkShippedSchema.safeParse({
    supplierOrderId: formData.get('supplierOrderId'),
    orderId: formData.get('orderId'),
    trackingNumber: formData.get('trackingNumber'),
  });
  if (!parsed.success) return;

  const { markSupplierOrderShipped } = getContainer();
  await markSupplierOrderShipped.execute(parsed.data);
  revalidatePath('/admin/fulfillment');
}
