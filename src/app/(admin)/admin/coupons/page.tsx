import { redirect } from 'next/navigation';

/** Coupons moved into Settings. Kept as a redirect rather than deleted: the
 * old path is in bookmarks and in at least one revalidatePath call, and a
 * 404 for something that merely moved is a poor answer. */
export default function AdminCouponsPage() {
  redirect('/admin/settings#coupons');
}
