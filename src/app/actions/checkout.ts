'use server';

import { z } from 'zod';

import { getContainer } from '@/composition/container';
import { isErr } from '@/shared/domain/result';
import { resolveCartOwner } from '@/app/lib/session';

const StartCheckoutSchema = z.object({
  customerEmail: z.string().email(),
  shippingName: z.string().min(1),
  shippingLine1: z.string().min(1),
  shippingLine2: z.string().optional(),
  shippingCity: z.string().min(1),
  shippingRegion: z.string().min(1),
  shippingPostalCode: z.string().min(1),
  shippingCountry: z.string().min(1),
});

export interface StartCheckoutActionResult {
  error?: string;
  orderId?: string;
  reference?: string;
  bip21Uri?: string;
  expiresAt?: string;
}

export async function startCheckoutAction(
  _prevState: StartCheckoutActionResult | undefined,
  formData: FormData,
): Promise<StartCheckoutActionResult> {
  const parsed = StartCheckoutSchema.safeParse({
    customerEmail: formData.get('customerEmail'),
    shippingName: formData.get('shippingName'),
    shippingLine1: formData.get('shippingLine1'),
    shippingLine2: formData.get('shippingLine2') || undefined,
    shippingCity: formData.get('shippingCity'),
    shippingRegion: formData.get('shippingRegion'),
    shippingPostalCode: formData.get('shippingPostalCode'),
    shippingCountry: formData.get('shippingCountry'),
  });
  if (!parsed.success) return { error: 'Please fill in a valid email and shipping address.' };

  const owner = await resolveCartOwner();
  const { placeOrder, startCheckout } = getContainer();

  const placed = await placeOrder.execute({
    owner,
    customerEmail: parsed.data.customerEmail,
    currency: 'USD',
    shippingAddress: {
      name: parsed.data.shippingName,
      line1: parsed.data.shippingLine1,
      line2: parsed.data.shippingLine2,
      city: parsed.data.shippingCity,
      region: parsed.data.shippingRegion,
      postalCode: parsed.data.shippingPostalCode,
      country: parsed.data.shippingCountry,
    },
  });
  if (isErr(placed)) {
    return {
      error:
        placed.error.code === 'empty_cart'
          ? 'Your cart is empty.'
          : 'An item in your cart is no longer available.',
    };
  }

  const result = await startCheckout.execute({
    orderId: placed.value.id,
    customerEmail: parsed.data.customerEmail,
    paymentMethod: 'crypto',
    idempotencyKey: placed.value.id,
  });
  if (isErr(result)) {
    return { error: 'Could not start checkout — try again.' };
  }

  return {
    orderId: placed.value.id,
    reference: result.value.reference,
    bip21Uri: result.value.bip21Uri,
    expiresAt: result.value.expiresAt?.toISOString(),
  };
}
