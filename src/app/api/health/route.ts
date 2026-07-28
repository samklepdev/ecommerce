import { NextResponse } from 'next/server';

import { getContainer } from '@/composition/container';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Liveness for the whole stack, not just for this process.
 *
 * Returns 503 when anything is down, so a load balancer takes the instance
 * out — and so an uptime monitor pointed here pages when the BTC watcher
 * stops. That process is the only thing that notices a customer paid, and
 * nothing else in the system would report its death.
 *
 * Unauthenticated by necessity (health checks don't carry credentials), so
 * the body is fixed status/reason codes only — see `CheckSystemHealth`.
 */
export async function GET(): Promise<NextResponse> {
  const { checkSystemHealth } = getContainer();
  const health = await checkSystemHealth.execute();

  return NextResponse.json(health, {
    status: health.status === 'ok' ? 200 : 503,
    headers: { 'cache-control': 'no-store' },
  });
}
