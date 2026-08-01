'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { getContainer } from '@/composition/container';
import { requireUser } from '@/app/lib/session';
import { addressSchema } from '@/app/lib/address-schema';

/**
 * `addressSchema` rather than a local copy: it trims and bounds every field,
 * and it normalises `region` on the way in. A US region stored as the raw
 * `"tx"` validated fine and then autofilled into `<select value="tx">`, which
 * matches no option — so the field submitted empty and checkout failed with a
 * generic error. The saved address looked right and could not be used.
 */
const AddSavedAddressSchema = addressSchema;

/** The address fields as the form posts them. Blank optionals are dropped so
 * an untouched `line2` is absent rather than an empty string. */
function addressFormValues(formData: FormData) {
  const value = (key: string) => {
    const raw = formData.get(key);
    return typeof raw === 'string' && raw.trim() !== '' ? raw : undefined;
  };
  return {
    name: value('name'),
    line1: value('line1'),
    line2: value('line2'),
    city: value('city'),
    region: value('region'),
    postalCode: value('postalCode'),
    country: value('country'),
  };
}

/** The first problem worth showing. A bad `id` isn't something the customer
 * typed, so its message would be noise where a field error belongs. */
function addressErrorMessage(error: z.ZodError): string {
  const issue = error.issues.find((i) => i.path[0] !== 'id');
  return issue?.message ?? 'Fill in all required address fields.';
}

export interface AddSavedAddressActionResult {
  message?: string;
  error?: string;
}

export async function addSavedAddressAction(
  _prevState: AddSavedAddressActionResult | undefined,
  formData: FormData,
): Promise<AddSavedAddressActionResult> {
  const user = await requireUser();
  const parsed = AddSavedAddressSchema.safeParse(addressFormValues(formData));
  if (!parsed.success) {
    return { error: addressErrorMessage(parsed.error) };
  }

  const { addSavedAddress } = getContainer();
  await addSavedAddress.execute({ userId: user.id, ...parsed.data, region: parsed.data.region ?? '' });

  revalidatePath('/account');
  return { message: 'Address saved.' };
}

const EditSavedAddressSchema = z
  .object({ id: z.string().min(1), address: addressSchema })
  .transform(({ id, address }) => ({ id, ...address }));

export interface EditSavedAddressActionResult {
  message?: string;
  error?: string;
}

export async function editSavedAddressAction(
  _prevState: EditSavedAddressActionResult | undefined,
  formData: FormData,
): Promise<EditSavedAddressActionResult> {
  const user = await requireUser();
  const parsed = EditSavedAddressSchema.safeParse({
    id: formData.get('id'),
    address: addressFormValues(formData),
  });
  if (!parsed.success) {
    return { error: addressErrorMessage(parsed.error) };
  }

  const { updateSavedAddress } = getContainer();
  const { id, ...details } = parsed.data;
  const updated = await updateSavedAddress.execute({
    id,
    userId: user.id,
    ...details,
    region: details.region ?? '',
  });
  if (!updated) return { error: 'Address not found.' };

  revalidatePath('/account');
  return { message: 'Address updated.' };
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
