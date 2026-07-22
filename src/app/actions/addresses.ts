'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { getContainer } from '@/composition/container';
import { requireUser } from '@/app/lib/session';

const AddSavedAddressSchema = z.object({
  name: z.string().min(1),
  line1: z.string().min(1),
  line2: z.string().optional(),
  city: z.string().min(1),
  region: z.string().optional(),
  postalCode: z.string().min(1),
  country: z.string().min(1),
});

export interface AddSavedAddressActionResult {
  message?: string;
  error?: string;
}

export async function addSavedAddressAction(
  _prevState: AddSavedAddressActionResult | undefined,
  formData: FormData,
): Promise<AddSavedAddressActionResult> {
  const user = await requireUser();
  const parsed = AddSavedAddressSchema.safeParse({
    name: formData.get('name'),
    line1: formData.get('line1'),
    line2: formData.get('line2') || undefined,
    city: formData.get('city'),
    region: formData.get('region') || undefined,
    postalCode: formData.get('postalCode'),
    country: formData.get('country'),
  });
  if (!parsed.success) return { error: 'Fill in all required address fields.' };

  const { addSavedAddress } = getContainer();
  await addSavedAddress.execute({ userId: user.id, ...parsed.data, region: parsed.data.region ?? '' });

  revalidatePath('/account');
  return { message: 'Address saved.' };
}

const SavedAddressIdSchema = z.object({
  id: z.string().min(1),
});

export async function deleteSavedAddressAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = SavedAddressIdSchema.safeParse({ id: formData.get('id') });
  if (!parsed.success) return;

  const { deleteSavedAddress } = getContainer();
  await deleteSavedAddress.execute({ id: parsed.data.id, userId: user.id });
  revalidatePath('/account');
}

export async function setDefaultSavedAddressAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = SavedAddressIdSchema.safeParse({ id: formData.get('id') });
  if (!parsed.success) return;

  const { setDefaultSavedAddress } = getContainer();
  await setDefaultSavedAddress.execute({ id: parsed.data.id, userId: user.id });
  revalidatePath('/account');
}
