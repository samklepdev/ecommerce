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
   `bitcoind`.
4. **Mainnet cutover.** `BTC_NETWORK` defaults to `testnet`. Going live means
   setting `bitcoin` + a real watch-only mainnet xpub (`BTC_ACCOUNT_XPUB`) —
   never a seed, mnemonic, or private key on the server, enforced by a Zod
   check in `src/config/env.ts`.

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

**Defaulted, tune if you need to:**

| Variable | Default | Notes |
| --- | --- | --- |
| `BTC_ESPLORA_URL` | `https://mempool.space/api` | The public API sees every address queried. Self-host `electrs`/Esplora in production — see the privacy note in CLAUDE.md |
| `BTC_REQUIRED_CONFIRMATIONS` | `2` | Confirmations before an order is `paid` |
| `BTC_SETTLEMENT_BUFFER_CONFIRMATIONS` | `1` | Extra depth before settlement is treated as final |
| `BTC_WATCH_INTERVAL_MS` | `45000` | How often the watcher polls |
| `QUOTE_TTL_SECONDS` | `900` | How long a fiat→BTC quote is held before the order expires |
| `SESSION_TTL_SECONDS` | `2592000` | 30 days |
| `PASSWORD_RESET_TTL_SECONDS` | `3600` | |
| `EMAIL_VERIFICATION_TTL_SECONDS` | `86400` | |

**Optional:**

| Variable | Notes |
| --- | --- |
| `IP_GEO_DB_PATH` | Path to the DB-IP Lite `.mmdb` used by the analytics map. Not in git — fetch it with `npm run geo:fetch` and bind-mount it. Unset, the map is simply empty; nothing else is affected |
| `ANALYTICS_DEV_IP` | Overrides the client IP when resolving location, so geolocation can be exercised locally where the real IP is `::1` |
