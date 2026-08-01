# Deployment

## What's verified and working

- `npm run build` succeeds with no live Postgres/Redis — every route in this
  app renders dynamically (the `Header`'s session check calls `cookies()`,
  which opts the whole tree out of static generation), so the build never
  queries a real database. It only needs `DATABASE_URL`/`REDIS_URL` to parse
  as well-formed URLs and `BTC_ACCOUNT_XPUB` to be a real base58check-valid
  public extended key (see `.github/workflows/ci.yml`'s `Build` step for the
  exact placeholder values used to prove this).
- `Dockerfile` — multi-stage build (`deps` → `builder` → `runner`), shared by
  both the `web` and `worker` services. The runner stage keeps full
  `node_modules` + TypeScript source (not just the Next.js build output)
  because the worker runs `src/workers/btc-watcher.ts` directly via `tsx`,
  not through Next's build.
- `docker-compose.yml` — `web` and `worker` services alongside the existing
  local-dev `postgres`/`redis`. `web`'s container command runs
  `npm run db:migrate` before `next start` on every boot (idempotent —
  drizzle only applies pending migrations). Verified locally: `docker
  compose up` brings up the full stack, migrations apply, and `/`, `/products`,
  `/cart` all return 200.
- Session cookies (`session_id`, `guest_session_id`) now set `secure: true`
  in production (env-gated so local HTTP dev still works).
- `/api/health` checks Postgres, Redis, and the BTC watcher's heartbeat, and
  answers 503 if any of them is down. Verified against a live stack: with no
  watcher running it returns 503 `never_reported`; with one running it
  returns 200 and the heartbeat age.
- `web` and `worker` carry `restart: unless-stopped`, and `web` has a
  container healthcheck pointed at `/api/health`.
- `scripts/backup-db.sh` + `docs/backups.md` — pg_dump with verification and
  retention, and a restore runbook. Both were exercised against the local
  database, including a restore into a scratch database.

## What's still undecided before going live with real money

These are real decisions, not code tasks — flagged here so they don't get
lost:

1. **Hosting platform.** Needs somewhere that runs a persistent `worker`
   process alongside `web` (the BTC watcher polls every 30–60s) — rules out
   pure serverless. Fly.io, Railway, or a VPS with this `docker-compose.yml`
   all fit.
2. **Image storage.** `LocalFileImageStorage` writes to `public/uploads/` on
   local disk — breaks on redeploy or with more than one instance. Needs a
   real object store (S3, R2, Cloudinary, …) before deploying anywhere with
   an ephemeral filesystem.
3. **Esplora/electrs provider.** `BTC_ESPLORA_URL` defaults to the public
   `mempool.space` API — fine for dev, but it sees every address this app
   ever queries. Production should run a self-hosted `electrs`/Esplora or
   `bitcoind`. Move only that variable: the fiat rate feed is
   `BTC_RATE_URL`, and `/v1/prices` is a mempool.space extension no Esplora
   node serves. Pointing both at your own node 404s the rate lookup and
   blocks every checkout.
4. **Email provider.** `RESEND_API_KEY` + `EMAIL_FROM` switch on real
   delivery. Without them nothing is sent — a customer who loses their order
   link has no confirmation email to find it in, and password reset is dead
   in the water. **Most** sending is on the BullMQ queue rather than in the request
   path — order confirmation, welcome, verification, payment-confirmed and the
   balance-owed email. Password reset and the shipping/tracking emails are still
   sent inline and have no job type, so a provider failure loses them. On the
   queued ones a provider having a bad minute is retried (five attempts,
   exponential backoff) instead of losing the mail; whatever exhausts its
   attempts stays in BullMQ's failed set, and `/api/health` reports the
   depths. That means the `worker` process has to be running for any mail to
   go out at all — a dead worker is now a silent mail outage as well as a
   silent payment outage.
5. **Mainnet cutover.** `BTC_NETWORK` defaults to `testnet`. Going live means
   setting `bitcoin` + a real watch-only mainnet xpub (`BTC_ACCOUNT_XPUB`) —
   never a seed, mnemonic, or private key on the server, enforced by a Zod
   check in `src/config/env.ts`.

## Taking it offline

Two tiers, both in `docs/kill-switch.md`: an app-level switch that keeps the process up and
stops it selling (settlement, admin and recovery keep working), and the hosting-level stop for
when you want the process gone — including what to check on the way back in.

## Monitoring, at minimum

Point an uptime monitor at `/api/health` and page on a non-200. It is the
only thing that reports a dead BTC watcher — that process is what notices a
customer paid, it runs as a single instance, and when it stops the failure
is completely silent: orders simply never settle and the first report comes
from a customer. The endpoint fails once the watcher has been quiet for
three poll intervals (floored at two minutes).

This is not error monitoring. A 500 in a request handler is still only a log
line on the box; that gap is unfixed and needs a service (Sentry or similar).

**Run exactly one worker.** There is no lock or leader election — a second
replica double-polls the Esplora provider and can trip its rate limits. The
work itself is idempotent, so this is a load concern, not a correctness one.

## Backups

`scripts/backup-db.sh` takes a verified, pruned pg_dump; `docs/backups.md`
has the schedule, the restore runbook, and the chain-reconciliation steps
that have to follow any restore. Postgres is the only record that an order
exists and what was owed — read that file before you launch, and do the
restore drill it describes.

## Deploying

```bash
docker compose build web worker
docker compose up -d postgres redis web worker
```

Real deployments should point `DATABASE_URL`/`REDIS_URL` at managed
services (not the `postgres`/`redis` services in this compose file, which
use dev-grade credentials) and inject the rest via whatever secrets
mechanism the chosen host provides.

Run `npm run db:migrate` against the target database before the first
boot of a new version; the app does not migrate on startup.

## Environment

`src/config/env.ts` is the only place environment is read, and it
validates at startup — a missing required value fails the boot rather
than surfacing later as a confusing runtime error.

**Required — no default, boot fails without them:**

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `REDIS_URL` | Carts, sessions, idempotency keys, BTC address index, rate limits |
| `BTC_ACCOUNT_XPUB` | **Watch-only account xpub only.** Validated as a public extended key; an `xprv`/`tprv` is rejected outright. A seed or private key must never reach the server |

**Defaulted, but wrong by default in production:**

| Variable | Default | Why it matters |
| --- | --- | --- |
| `BTC_NETWORK` | `testnet` | Must be `bitcoin` for real money |
| `APP_URL` | `http://localhost:3000` | Used to build links in outbound email. Left unset, password-reset and verification emails point customers at localhost |
| `SUPPORT_EMAIL` | `support@storefront.example` | Shown in the storefront footer as the contact address — a real one, or customers write to nobody |
| `RESEND_API_KEY` | *(unset)* | Unset, `ConsoleEmailSender` logs email instead of sending it: password resets, email verification and order confirmations never reach anyone. Set it in production, and check the startup log — the stub says so on boot |
| `EMAIL_FROM` | *(unset)* | The sender address, verified on the Resend account. Required whenever `RESEND_API_KEY` is set (boot fails otherwise, rather than letting every send 422 one at a time) |

**Defaulted, tune if you need to:**

| Variable | Default | Notes |
| --- | --- | --- |
| `BTC_ESPLORA_URL` | `https://mempool.space/api` | Chain data only. The public API sees every address queried. Self-host `electrs`/Esplora in production — see the privacy note in CLAUDE.md |
| `BTC_RATE_URL` | `https://mempool.space/api` | The fiat→BTC price feed (`/v1/prices`), a mempool.space extension rather than an Esplora endpoint. Separate from `BTC_ESPLORA_URL` so self-hosting a node doesn't 404 the rate lookup and stop checkout |
| `BTC_REQUIRED_CONFIRMATIONS` | `2` | Confirmations before an order is `paid` |
| `BTC_SETTLEMENT_BUFFER_CONFIRMATIONS` | `1` | Extra depth before settlement is treated as final |
| `BTC_WATCH_INTERVAL_MS` | `45000` | How often the watcher polls |
| `QUOTE_TTL_SECONDS` | `900` | How long a fiat→BTC quote is held. A lapsed quote does **not** expire the order — the customer re-quotes at today's rate on the same address |
| `SESSION_TTL_SECONDS` | `2592000` | 30 days |
| `ORDER_PAYMENT_WINDOW_HOURS` | `24` | How long an order stays open for payment |
| `AWAITING_CONFIRMATION_WINDOW_HOURS` | `48` | How long an order may sit part-paid before it is failed. **The sharpest clock here** — when it runs out a customer who part-paid loses that money, because `failed` is terminal and there is no refund path |
| `ANALYTICS_RETENTION_DAYS` | — | How long page-view/search/cart rows are kept before pruning |
| `SESSION_IDLE_TIMEOUT_SECONDS` | 14 days | Customer idle window |
| `ADMIN_SESSION_IDLE_TIMEOUT_SECONDS` | 1 hour | Admin idle window — an admin session can cancel a paid order |
| `ADMIN_REAUTH_WINDOW_SECONDS` | `900` | How long a typed password authorises destructive admin actions |
| `PASSWORD_RESET_TTL_SECONDS` | `3600` | |
| `EMAIL_VERIFICATION_TTL_SECONDS` | `86400` | |

**Optional:**

| Variable | Notes |
| --- | --- |
| `IP_GEO_DB_PATH` | Path to the DB-IP Lite `.mmdb` used by the analytics map. Not in git — fetch it with `npm run geo:fetch` and bind-mount it. Unset, the map is simply empty; nothing else is affected |
| `ANALYTICS_DEV_IP` | Overrides the client IP when resolving location, so geolocation can be exercised locally where the real IP is `::1` |
