import { NextResponse } from 'next/server';

import { getContainer } from '@/composition/container';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Whether the shop is taking orders. Public, because the storefront already
 * says so on every page — this just lets an open tab find out without being
 * refreshed by hand.
 *
 * Deliberately one boolean. The closure's reason, who set it and when are
 * operator information and stay in the admin console and the audit log.
 */
export async function GET(): Promise<NextResponse> {
  const { getStoreAvailability } = getContainer();
  const { isOpen } = await getStoreAvailability.execute();

  return NextResponse.json({ open: isOpen }, { headers: { 'cache-control': 'no-store' } });
}
