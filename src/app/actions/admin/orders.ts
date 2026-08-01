'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { getContainer } from '@/composition/container';
import { isErr } from '@/shared/domain/result';
import { Money } from '@/shared/domain/money';
import { satsToBtcString } from '@/modules/payments/domain/bip21';
import { MAX_CART_LINE_QUANTITY } from '@/modules/cart/domain/cart-line';
import { requireAdmin, requireRecentAdminAuth } from '@/app/lib/session';

/** Same ceiling the cart enforces — an admin editing an order shouldn't be
 * able to write a quantity a customer couldn't have ordered. */
const MAX_ORDER_LINE_QUANTITY = MAX_CART_LINE_QUANTITY;

const FailOrderSchema = z.object({
  orderId: z.string().min(1),
});

export interface FailOrderActionResult {
  message?: string;
  error?: string;
}

/**
 * Closes out an order that isn't going to be paid.
 *
 * The automatic timers do this on their own — 24h for an order nothing arrived
 * for, `AWAITING_CONFIRMATION_WINDOW_HOURS` for a part-payment that never
 * completes. This is for when you already know: a customer who emails to give
 * up, or an order you want off the board now.
 *
 * `failed`, not `cancelled`: non-payment is a failure, and `cancelled` means
 * somebody decided not to proceed. Keeping them distinct is what makes the
 * audit log and the analytics readable.
 */
export async function failOrderAction(
  _prevState: FailOrderActionResult | undefined,
  formData: FormData,
): Promise<FailOrderActionResult> {
  const admin = await requireAdmin();
  const parsed = FailOrderSchema.safeParse({ orderId: formData.get('orderId') });
  if (!parsed.success) return { error: 'Missing order.' };

  const { failOrder, recordAuditLogEntry } = getContainer();
  const result = await failOrder.execute({ orderId: parsed.data.orderId });
  if (isErr(result)) {
    return {
      error:
        result.error.code === 'not_found'
          ? 'Order not found.'
          : 'This order cannot be marked failed from its current status.',
    };
  }

  await recordAuditLogEntry.execute({
    actorUserId: admin.id,
    actorEmail: admin.email,
    action: 'order.failed',
    targetType: 'order',
    targetId: parsed.data.orderId,
  });

  revalidatePath(`/admin/orders/${parsed.data.orderId}`);
  revalidatePath('/admin/orders');
  return { message: 'Order marked failed.' };
}

const CancelOrderFulfillmentSchema = z.object({
  orderId: z.string().min(1),
  /** Recorded in the audit log, never shown to the customer. */
  reason: z.string().trim().min(1).max(500),
});

export interface CancelOrderFulfillmentActionResult {
  message?: string;
  error?: string;
}

/**
 * Closes out an order the shop is not going to fulfil — goods that can't be
 * obtained, or a parcel lost in transit.
 *
 * Sudo-gated like the other destructive admin actions, and for a sharper reason
 * than most: on a paid order this is
 * terminal and the customer has already parted with money. A reason is required
 * because "why" is the only part of this a human will need later, and it goes to
 * the audit log — **not** to the customer, who is never told anything about how
 * we obtain stock.
 *
 * Payment status is deliberately untouched: if they paid, they paid.
 */
export async function cancelOrderFulfillmentAction(
  _prevState: CancelOrderFulfillmentActionResult | undefined,
  formData: FormData,
): Promise<CancelOrderFulfillmentActionResult> {
  const sudo = await requireRecentAdminAuth();
  if (!sudo.ok) return { error: sudo.reason };
  const admin = sudo.admin;

  const parsed = CancelOrderFulfillmentSchema.safeParse({
    orderId: formData.get('orderId'),
    reason: formData.get('reason'),
  });
  if (!parsed.success) return { error: 'Give a reason for cancelling this order.' };

  const { cancelOrderFulfillment, recordAuditLogEntry } = getContainer();
  const result = await cancelOrderFulfillment.execute({ orderId: parsed.data.orderId });
  if (isErr(result)) {
    return {
      error:
        result.error.code === 'not_found'
          ? 'Order not found.'
          : 'A delivered order cannot be cancelled.',
    };
  }

  await recordAuditLogEntry.execute({
    actorUserId: admin.id,
    actorEmail: admin.email,
    action: 'order.fulfillment_cancelled',
    targetType: 'order',
    targetId: parsed.data.orderId,
    metadata: { reason: parsed.data.reason },
  });

  revalidatePath(`/admin/orders/${parsed.data.orderId}`);
  revalidatePath('/admin/orders');
  revalidatePath('/admin/fulfillment');
  return { message: 'Order cancelled. The customer has not been notified automatically.' };
}

const MarkOrderDeliveredSchema = z.object({
  orderId: z.string().min(1),
});

export interface MarkOrderDeliveredActionResult {
  message?: string;
  error?: string;
}

/** No carrier webhook exists to detect delivery automatically — an admin
 * records it once the shipment has actually arrived. Routine fulfillment
 * update, same as marking a supplier order shipped — not audit-logged. */
export async function markOrderDeliveredAction(
  _prevState: MarkOrderDeliveredActionResult | undefined,
  formData: FormData,
): Promise<MarkOrderDeliveredActionResult> {
  await requireAdmin();
  const parsed = MarkOrderDeliveredSchema.safeParse({ orderId: formData.get('orderId') });
  if (!parsed.success) return { error: 'Missing order.' };

  const { markOrderDelivered } = getContainer();
  const result = await markOrderDelivered.execute({ orderId: parsed.data.orderId });
  if (isErr(result)) {
    return {
      error:
        result.error.code === 'not_found'
          ? 'Order not found.'
          : 'This order cannot be marked delivered from its current status.',
    };
  }

  revalidatePath(`/admin/orders/${parsed.data.orderId}`);
  revalidatePath('/admin/orders');
  return { message: 'Order marked delivered.' };
}

const UpdateOrderNotesSchema = z.object({
  orderId: z.string().min(1),
  notes: z.string().optional(),
});

export interface UpdateOrderNotesActionResult {
  message?: string;
  error?: string;
}

/** Internal ops notes — admin-only, never shown to customers. Routine
 * catalog/ops edit, same as marking a supplier order shipped — not
 * audit-logged. */
export async function updateOrderNotesAction(
  _prevState: UpdateOrderNotesActionResult | undefined,
  formData: FormData,
): Promise<UpdateOrderNotesActionResult> {
  await requireAdmin();
  const parsed = UpdateOrderNotesSchema.safeParse({
    orderId: formData.get('orderId'),
    notes: formData.get('notes') || undefined,
  });
  if (!parsed.success) return { error: 'Missing order.' };

  const { updateOrderNotes } = getContainer();
  await updateOrderNotes.execute({
    orderId: parsed.data.orderId,
    notes: parsed.data.notes?.trim() || null,
  });

  revalidatePath(`/admin/orders/${parsed.data.orderId}`);
  return { message: 'Notes saved.' };
}

const EditOrderLineSchema = z.object({
  orderId: z.string().min(1),
  orderLineId: z.string().min(1),
  quantity: z.coerce.number().int().min(0).max(MAX_ORDER_LINE_QUANTITY),
});

const AddOrderLineSchema = z.object({
  orderId: z.string().min(1),
  productId: z.string().min(1),
  quantity: z.coerce.number().int().min(1).max(MAX_ORDER_LINE_QUANTITY),
});

export interface EditOrderLinesActionResult {
  message?: string;
  error?: string;
}

function describeEditError(code: string): string {
  switch (code) {
    case 'lines_locked':
      return "This order's items can't be changed — the chain has already seen a payment for it.";
    case 'last_line':
      return 'An order needs at least one item. Cancel the order instead.';
    case 'product_unavailable':
      return "That product can't be added (it no longer exists, or it's priced in another currency).";
    case 'reprice_failed':
      return 'The items were saved, but the Bitcoin amount could not be restated. Check the order before telling the customer anything.';
    case 'line_not_found':
      return 'That line is no longer on the order.';
    default:
      return 'That order no longer exists.';
  }
}

/** Quantity 0 removes the line. Only reachable while the order is unpaid —
 * the use case enforces that, this just reports it. */
export async function setOrderLineQuantityAction(
  _prevState: EditOrderLinesActionResult | undefined,
  formData: FormData,
): Promise<EditOrderLinesActionResult> {
  const admin = await requireAdmin();
  const parsed = EditOrderLineSchema.safeParse({
    orderId: formData.get('orderId'),
    orderLineId: formData.get('orderLineId'),
    quantity: formData.get('quantity'),
  });
  if (!parsed.success) return { error: 'Enter a whole quantity.' };

  const { editOrderLines, recordAuditLogEntry } = getContainer();
  const result = await editOrderLines.execute({
    orderId: parsed.data.orderId,
    op: 'set_quantity',
    orderLineId: parsed.data.orderLineId,
    quantity: parsed.data.quantity,
  });
  if (isErr(result)) return { error: describeEditError(result.error.code) };

  await recordAuditLogEntry.execute({
    actorUserId: admin.id,
    actorEmail: admin.email,
    action: 'order.line_quantity_changed',
    targetType: 'order',
    targetId: parsed.data.orderId,
    metadata: {
      orderLineId: parsed.data.orderLineId,
      quantity: parsed.data.quantity,
      newTotalMinor: result.value.totalMinor,
    },
  });

  revalidatePath(`/admin/orders/${parsed.data.orderId}`);
  return { message: repriceMessage(result.value) };
}

export async function addOrderLineAction(
  _prevState: EditOrderLinesActionResult | undefined,
  formData: FormData,
): Promise<EditOrderLinesActionResult> {
  const admin = await requireAdmin();
  const parsed = AddOrderLineSchema.safeParse({
    orderId: formData.get('orderId'),
    productId: formData.get('productId'),
    quantity: formData.get('quantity'),
  });
  if (!parsed.success) return { error: 'Pick a product and a quantity.' };

  const { editOrderLines, recordAuditLogEntry } = getContainer();
  const result = await editOrderLines.execute({
    orderId: parsed.data.orderId,
    op: 'add_product',
    productId: parsed.data.productId,
    quantity: parsed.data.quantity,
  });
  if (isErr(result)) return { error: describeEditError(result.error.code) };

  await recordAuditLogEntry.execute({
    actorUserId: admin.id,
    actorEmail: admin.email,
    action: 'order.line_added',
    targetType: 'order',
    targetId: parsed.data.orderId,
    metadata: {
      productId: parsed.data.productId,
      quantity: parsed.data.quantity,
      newTotalMinor: result.value.totalMinor,
    },
  });

  revalidatePath(`/admin/orders/${parsed.data.orderId}`);
  return { message: repriceMessage(result.value) };
}

/** Says plainly whether the customer is now being asked for a different
 * amount of BTC — the consequence an admin most needs to see. */
function repriceMessage(result: { totalMinor: number; currency: string; repricedSats: number | null }): string {
  const total = Money.of(result.totalMinor, result.currency).toDisplayString();
  if (result.repricedSats === null) return `Order updated. New total ${total}.`;
  return `Order updated. New total ${total}, and the payment now asks for ${satsToBtcString(result.repricedSats)} BTC at the same address.`;
}

const UpdateOrderContactSchema = z.object({
  orderId: z.string().min(1),
  customerEmail: z.string().email().optional(),
  name: z.string().min(1).optional(),
  line1: z.string().min(1).optional(),
  line2: z.string().optional(),
  city: z.string().min(1).optional(),
  region: z.string().min(1).optional(),
  postalCode: z.string().min(1).optional(),
  country: z.string().min(1).optional(),
});

export interface UpdateOrderContactActionResult {
  message?: string;
  error?: string;
}

export async function updateOrderContactAction(
  _prevState: UpdateOrderContactActionResult | undefined,
  formData: FormData,
): Promise<UpdateOrderContactActionResult> {
  const admin = await requireAdmin();
  const raw = Object.fromEntries(
    ['orderId', 'customerEmail', 'name', 'line1', 'line2', 'city', 'region', 'postalCode', 'country'].map(
      (key) => [key, (formData.get(key) as string | null) || undefined],
    ),
  );
  const parsed = UpdateOrderContactSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the details and try again.' };
  }

  const { name, line1, city, region, postalCode, country } = parsed.data;
  const hasAddress = Boolean(name && line1 && city && region && postalCode && country);

  const { updateOrderContact, recordAuditLogEntry } = getContainer();
  const result = await updateOrderContact.execute({
    orderId: parsed.data.orderId,
    customerEmail: parsed.data.customerEmail,
    shippingAddress: hasAddress
      ? {
          name: name!,
          line1: line1!,
          line2: parsed.data.line2,
          city: city!,
          region: region!,
          postalCode: postalCode!,
          country: country!,
        }
      : undefined,
  });

  if (isErr(result)) {
    switch (result.error.code) {
      case 'contact_locked':
        return { error: 'This order has already shipped — its details are fixed.' };
      case 'invalid_address':
        return { error: result.error.message };
      case 'nothing_to_change':
        return { error: 'Nothing to change.' };
      default:
        return { error: 'That order no longer exists.' };
    }
  }

  await recordAuditLogEntry.execute({
    actorUserId: admin.id,
    actorEmail: admin.email,
    action: 'order.contact_updated',
    targetType: 'order',
    targetId: parsed.data.orderId,
    metadata: { emailChanged: Boolean(parsed.data.customerEmail), addressChanged: hasAddress },
  });

  revalidatePath(`/admin/orders/${parsed.data.orderId}`);
  return { message: 'Order details updated.' };
}
