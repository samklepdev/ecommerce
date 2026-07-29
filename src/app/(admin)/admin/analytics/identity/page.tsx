import { getContainer } from '@/composition/container';
import { requireAdmin } from '@/app/lib/session';
import { summariseUserAgent } from '@/shared/domain/user-agent';
import { parseDateRange } from '../date-range';
import type { DrillDownSearchParams } from '../drill-down';
import { DrillDownHeader } from '../components/DrillDownHeader';
import { EventLogTable } from '../components/EventLogTable';
import { IdentityLookupForm } from './IdentityLookupForm';
import styles from '../drill-down.module.css';
import identityStyles from './page.module.css';

export const dynamic = 'force-dynamic';

const BASE_PATH = '/admin/analytics/identity';

interface IdentityPageProps {
  searchParams: Promise<DrillDownSearchParams & { email?: string; session?: string }>;
}

/** One line per event type, since this view mixes them: a page view carries
 * its path, a search its term, a cart change its lines. */
function detailFor(row: { eventType: string; path: string | null; metadata: Record<string, unknown> | null }): string {
  if (row.eventType === 'search') {
    const term = row.metadata?.term;
    return typeof term === 'string' ? `“${term}”` : '—';
  }
  return row.path ?? '—';
}

/**
 * Everything one visitor did in a window.
 *
 * The other drill-downs slice by event type across everyone; this slices by
 * person across every type — the view you want when a customer writes in, or
 * when something looks wrong on one order.
 *
 * Identity is a session id. For a signed-in visitor that *is* their user id
 * (see the port's note), which is why an email lookup resolves to one.
 */
export default async function IdentityPage({ searchParams }: IdentityPageProps) {
  await requireAdmin();
  const params = await searchParams;
  const range = parseDateRange(params);
  const { since, until } = range;

  const email = params.email?.trim() || undefined;
  const explicitSession = params.session?.trim() || undefined;

  const { findUserByEmailForAdmin, getEventsForIdentity } = getContainer();

  const profile = email ? await findUserByEmailForAdmin.execute({ email }) : null;
  // An explicit session id wins: a guest has no account to look up, and
  // that's exactly who you're most often chasing.
  const sessionId = explicitSession ?? profile?.id ?? null;

  const result = sessionId
    ? await getEventsForIdentity.execute({ sessionId, since, until })
    : { events: [] };

  const agents = [...new Set(result.events.map((e) => summariseUserAgent(e.userAgent)).filter(Boolean))];
  const addresses = [...new Set(result.events.map((e) => e.ipAddress).filter(Boolean))];

  return (
    <div className={styles.page}>
      <DrillDownHeader
        title="Activity by visitor"
        since={since}
        until={until}
        basePath={BASE_PATH}
        exportHref={`/api/admin/analytics/page-views/export?since=${since.toISOString()}&until=${until.toISOString()}`}
      />

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Who</h2>
        <p className={styles.meta}>
          Look someone up by the email on their account, or paste a session id from any other
          analytics table to follow a visitor who never signed in.
        </p>
        <IdentityLookupForm email={email} session={explicitSession} range={range} />

        {email && !profile && !explicitSession && (
          <p className={styles.meta}>No account with that email.</p>
        )}

        {sessionId && (
          <dl className={identityStyles.facts}>
            <div>
              <dt>Identity</dt>
              <dd>{profile ? profile.email : 'Guest session'}</dd>
            </div>
            <div>
              <dt>Session</dt>
              <dd className={identityStyles.mono}>{sessionId}</dd>
            </div>
            <div>
              <dt>Events</dt>
              <dd>{result.events.length}</dd>
            </div>
            <div>
              <dt>Seen on</dt>
              <dd>{agents.length > 0 ? agents.join(', ') : '—'}</dd>
            </div>
            <div>
              <dt>From</dt>
              <dd className={identityStyles.mono}>
                {addresses.length > 0 ? addresses.join(', ') : '—'}
              </dd>
            </div>
          </dl>
        )}
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Everything they did</h2>
        <EventLogTable
          rows={result.events}
          detailHeader="Detail"
          detail={detailFor}
          emptyLabel={
            sessionId
              ? 'Nothing recorded for them in this range.'
              : 'Enter an email or a session id above.'
          }
        />
      </div>
    </div>
  );
}
