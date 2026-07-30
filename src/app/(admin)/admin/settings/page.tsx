import { env } from '@/config/env';
import { getContainer } from '@/composition/container';
import { requireAdmin } from '@/app/lib/session';
import { Money } from '@/shared/domain/money';
import { ShippingRateEditor } from './ShippingRateEditor';
import { CouponsPanel } from './CouponsPanel';
import { StoreSwitch } from './StoreSwitch';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

function seconds(total: number): string {
  if (total % 86_400 === 0) return `${total / 86_400} day${total === 86_400 ? '' : 's'}`;
  if (total % 3_600 === 0) return `${total / 3_600} hour${total === 3_600 ? '' : 's'}`;
  if (total % 60 === 0) return `${total / 60} minutes`;
  return `${total} seconds`;
}

/** Host only. A self-hosted node's URL can carry a token, and this is a
 * screen someone might well be sharing. */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * Everything that governs how the store behaves: what an admin can change,
 * and what the environment pins.
 *
 * The env-derived half is deliberately shown read-only rather than left out.
 * "Where do I change the confirmation count?" is a real question, and a
 * settings page that doesn't mention it answers with silence — so it's here,
 * marked as environment, named exactly as the variable is.
 *
 * Nothing secret is rendered: provider URLs show only their host, the xpub
 * isn't here at all, and the mail key is reported as configured or not.
 */
export default async function AdminSettingsPage() {
  await requireAdmin();

  const { getShippingRate, listCoupons, checkSystemHealth, getStoreAvailability } = getContainer();
  const [shippingRate, coupons, health, storeAvailability] = await Promise.all([
    getShippingRate.execute(),
    listCoupons.execute(),
    checkSystemHealth.execute(),
    getStoreAvailability.execute(),
  ]);

  const emailConfigured = Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
  const activeCoupons = coupons.filter((c) => c.isActive).length;

  return (
    <div className={styles.page}>
      <header className={styles.pageHead}>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true" />
          <h1>Settings</h1>
        </div>
        <span className={styles.headMeta}>
          {env.BTC_NETWORK} · {activeCoupons} active coupon{activeCoupons === 1 ? '' : 's'}
        </span>
      </header>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>Storefront</h2>
          <span className={styles.sectionCount}>what you can change here</span>
        </div>

        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <h3 className={styles.panelTitle}>Store status</h3>
          </div>
          <StoreSwitch
            isOpen={storeAvailability.isOpen}
            closedAt={storeAvailability.closure?.closedAt.toISOString() ?? null}
            closedBy={storeAvailability.closure?.closedBy ?? null}
            reason={storeAvailability.closure?.reason ?? null}
          />
        </div>

        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <h3 className={styles.panelTitle}>Shipping</h3>
          </div>
          <p className={styles.panelNote}>
            A single flat rate charged once per order, regardless of what&apos;s in the cart. It is
            snapshotted onto each order at checkout, so changing it never alters an order already
            placed — or the BTC amount already quoted for it.
          </p>
          <ShippingRateEditor
            amountMinor={shippingRate.amountMinor}
            currency={shippingRate.currency}
          />
        </div>

        <CouponsPanel
          coupons={coupons.map((c) => ({
            id: c.id,
            code: c.code,
            isActive: c.isActive,
            discountDisplay:
              c.discountType === 'percentage'
                ? `${c.percentageValue}% off`
                : `${Money.of(c.fixedAmountMinor ?? 0, c.currency ?? 'USD').toDisplayString()} off`,
          }))}
        />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>Payments</h2>
          <span className={styles.sectionCount}>from the environment</span>
        </div>

        <div className={styles.panel}>
          <p className={styles.panelNote}>
            Set at deploy time, not here — these decide how money is taken, and a form that could
            change them from a browser session would be the softest target in the app.
          </p>
          <dl className={styles.facts}>
            <div>
              <dt>Network</dt>
              <dd className={env.BTC_NETWORK === 'bitcoin' ? undefined : styles.warn}>
                {env.BTC_NETWORK}
                {env.BTC_NETWORK !== 'bitcoin' && ' — not real money'}
                <span className={styles.envTag}>BTC_NETWORK</span>
              </dd>
            </div>
            <div>
              <dt>Confirmations</dt>
              <dd>
                {env.BTC_REQUIRED_CONFIRMATIONS} + {env.BTC_SETTLEMENT_BUFFER_CONFIRMATIONS} buffer
                <span className={styles.envTag}>BTC_REQUIRED_CONFIRMATIONS</span>
              </dd>
            </div>
            <div>
              <dt>Quote held for</dt>
              <dd>
                {seconds(env.QUOTE_TTL_SECONDS)}
                <span className={styles.envTag}>QUOTE_TTL_SECONDS</span>
              </dd>
            </div>
            <div>
              <dt>Watcher interval</dt>
              <dd>
                {Math.round(env.BTC_WATCH_INTERVAL_MS / 1000)}s
                <span className={styles.envTag}>BTC_WATCH_INTERVAL_MS</span>
              </dd>
            </div>
            <div>
              <dt>Chain data</dt>
              <dd className={styles.mono}>
                {hostOf(env.BTC_ESPLORA_URL)}
                <span className={styles.envTag}>BTC_ESPLORA_URL</span>
              </dd>
            </div>
            <div>
              <dt>Rate feed</dt>
              <dd className={styles.mono}>
                {hostOf(env.BTC_RATE_URL)}
                <span className={styles.envTag}>BTC_RATE_URL</span>
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>System</h2>
          <span className={styles.sectionCount}>right now</span>
        </div>

        <div className={styles.panel}>
          <p className={styles.panelNote}>
            The same checks <code>/api/health</code>{' '}answers with. The watcher is the one that
            matters: it&apos;s the only thing that notices a customer paid, and when it stops,
            orders simply never settle.
          </p>
          <dl className={styles.facts}>
            <div>
              <dt>Database</dt>
              <dd className={health.checks.database.status === 'ok' ? styles.ok : styles.bad}>
                {health.checks.database.status === 'ok' ? 'reachable' : 'unreachable'}
              </dd>
            </div>
            <div>
              <dt>Redis</dt>
              <dd className={health.checks.redis.status === 'ok' ? styles.ok : styles.bad}>
                {health.checks.redis.status === 'ok' ? 'reachable' : 'unreachable'}
              </dd>
            </div>
            <div>
              <dt>BTC watcher</dt>
              <dd className={health.checks.btcWatcher.status === 'ok' ? styles.ok : styles.bad}>
                {health.checks.btcWatcher.status === 'ok'
                  ? `last pass ${health.checks.btcWatcher.ageSeconds}s ago`
                  : health.checks.btcWatcher.reason === 'never_reported'
                    ? 'never reported'
                    : `stale — ${health.checks.btcWatcher.ageSeconds}s since last pass`}
              </dd>
            </div>
            <div>
              <dt>Outbound email</dt>
              <dd className={emailConfigured ? styles.ok : styles.warn}>
                {emailConfigured ? `sending as ${env.EMAIL_FROM}` : 'logged, not sent'}
                <span className={styles.envTag}>RESEND_API_KEY</span>
              </dd>
            </div>
            <div>
              <dt>Support address</dt>
              <dd className={styles.mono}>
                {env.SUPPORT_EMAIL}
                <span className={styles.envTag}>SUPPORT_EMAIL</span>
              </dd>
            </div>
            <div>
              <dt>Public URL</dt>
              <dd className={styles.mono}>
                {env.APP_URL}
                <span className={styles.envTag}>APP_URL</span>
              </dd>
            </div>
            <div>
              <dt>Sessions last</dt>
              <dd>
                {seconds(env.SESSION_TTL_SECONDS)}
                <span className={styles.envTag}>SESSION_TTL_SECONDS</span>
              </dd>
            </div>
            <div>
              <dt>Indexing</dt>
              <dd>disallowed for every crawler</dd>
            </div>
          </dl>
        </div>
      </section>
    </div>
  );
}
