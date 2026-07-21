# Multi-stage build shared by both the `web` and `worker` services (see
# docker-compose.yml) — the worker runs `src/workers/btc-watcher.ts` directly
# via tsx against TypeScript source, so the runtime stage keeps full
# node_modules + source rather than a slimmed-down Next.js standalone output.

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build-time env only needs to satisfy src/config/env.ts's Zod schema — no
# route in this app statically generates against a real Postgres/Redis (see
# the CI workflow's comment for how this was confirmed), so these are
# well-formed placeholders, not real credentials. Real values are supplied
# at container start via docker-compose's `environment:`.
ENV DATABASE_URL="postgres://build:build@localhost:5432/build" \
    REDIS_URL="redis://localhost:6379" \
    BTC_ACCOUNT_XPUB="tpubDDTyJEgNqk6uZKJ6vdM1HdNytMarfrTJBkQH1MGSiYrCnPrkXr1642ndLRb1FbDYBRbHzrq25w2MsGrRrEZziNj1v3BQcmxjYqAMc4iaVQ6"
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY package.json ./
COPY next.config.ts tsconfig.json ./
COPY src ./src
COPY drizzle ./drizzle
COPY drizzle.config.ts ./
COPY scripts ./scripts

EXPOSE 3000

# Default command runs the web server; docker-compose overrides this for the
# `worker` service (`npm run worker`). Migrations run once, before `next
# start`, not per-request — `drizzle-kit migrate` only applies pending
# migrations, so it's safe to run this on every deploy/restart.
CMD ["sh", "-c", "npm run db:migrate && npm run start"]
