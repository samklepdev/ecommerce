# Project Structure & Architecture

A Next.js (App Router) storefront built on Clean Architecture / DDD principles. The web
framework and the payment provider are both **adapters** — the domain never imports them.

## Stack

| Concern            | Choice                          | Why |
| ------------------ | ------------------------------- | --- |
| Framework          | Next.js (App Router)            | SSR/ISR for crawlable, fast product pages |
| Language           | TypeScript (strict)             | — |
| DB                 | PostgreSQL                      | Durable orders, catalog, payment intents |
| ORM                | Drizzle                         | SQL-close control for atomic updates |
| Cache / sessions   | Redis                           | Carts, sessions, idempotency keys, BTC address index, rate limits |
| Queue              | BullMQ (on Redis)               | BTC chain-watcher, email, fulfillment |
| Payments           | Non-custodial on-chain Bitcoin  | No processor, no custody; server holds only a watch-only xpub |
| Tax / AML          | Not delegated — we own it       | With no processor in the flow, obligations land on us. See CLAUDE.md |
| Search             | Postgres FTS → Typesense later  | Start simple, graduate when faceting is needed |
| Validation         | Zod                             | Shared schemas, request + domain boundaries |

## Layering (dependency rule)

Dependencies point **inward only**. `domain` knows nothing about anything else.

```
presentation (Next app/) ─┐
                          ├─→ application (use cases) ─→ domain (entities, VOs)
infrastructure (adapters)─┘                                     ↑
        └──────────── implements ports defined in application ──┘
```

- **domain** — entities, value objects, domain events, invariants. Pure TS, zero deps.
- **application** — use cases (interactors) + **ports** (interfaces the outside must implement).
- **infrastructure** — adapters: Drizzle repos, bitcoin/Esplora clients, Redis, BullMQ, email.
- **presentation** — Next.js App Router: server components, route handlers, server actions.

## Directory layout

```
ecommerce/
├── CLAUDE.md
├── PROJECT_STRUCTURE.md
├── drizzle.config.ts
├── next.config.ts
├── package.json
├── tsconfig.json
├── .env.example
│
├── drizzle/                        # generated migrations (SQL)
│
└── src/
    ├── app/                        # PRESENTATION — Next.js App Router
    │   ├── (storefront)/
    │   │   ├── page.tsx             # home  (ISR, cached)
    │   │   ├── products/
    │   │   │   ├── page.tsx         # catalog listing (ISR)
    │   │   │   └── [slug]/page.tsx  # product detail (ISR + generateMetadata)
    │   │   ├── cart/page.tsx        # dynamic (never cached)
    │   │   └── checkout/page.tsx    # dynamic
    │   ├── api/
    │   │   ├── orders/[id]/status/route.ts  # polled by the checkout page
    │   │   └── health/route.ts
    │   ├── layout.tsx
    │   └── actions/                 # server actions → call use cases only
    │       ├── cart.ts
    │       └── checkout.ts
    │
    ├── modules/                     # BOUNDED CONTEXTS (domain + app + infra per context)
    │   ├── catalog/
    │   │   ├── domain/
    │   │   │   ├── product.ts             # Product entity
    │   │   │   └── slug.ts                # value object
    │   │   ├── application/
    │   │   │   ├── ports/product-repository.ts
    │   │   │   └── use-cases/
    │   │   │       ├── get-product-by-slug.ts
    │   │   │       └── list-products.ts
    │   │   └── infrastructure/
    │   │       └── drizzle-product-repository.ts
    │   │
    │   ├── cart/
    │   │   ├── domain/
    │   │   │   ├── cart.ts                # Cart aggregate (guest + user)
    │   │   │   └── cart-line.ts
    │   │   ├── application/
    │   │   │   ├── ports/cart-repository.ts
    │   │   │   └── use-cases/
    │   │   │       ├── add-to-cart.ts
    │   │   │       ├── merge-guest-cart.ts   # on login
    │   │   │       └── reprice-cart.ts       # never trust client price
    │   │   └── infrastructure/
    │   │       └── redis-cart-repository.ts
    │   │
    │   ├── checkout/
    │   │   ├── application/
    │   │   │   └── use-cases/
    │   │   │       └── start-checkout.ts     # reprice + refuse unpayable + create PaymentIntent
    │   │   └── ...
    │   │
    │   ├── orders/
    │   │   ├── domain/
    │   │   │   ├── order.ts               # Order aggregate
    │   │   │   ├── order-status.ts        # explicit state machine (see CLAUDE.md)
    │   │   │   └── order-line.ts
    │   │   ├── application/
    │   │   │   ├── ports/order-repository.ts
    │   │   │   └── use-cases/
    │   │   │       ├── place-order.ts
    │   │   │       ├── confirm-payment.ts    # the ONLY path to `paid`; watcher-driven
    │   │   │       └── cancel-order-fulfillment.ts # close an order the shop won't fulfil
    │   │   └── infrastructure/
    │   │       └── drizzle-order-repository.ts
    │   │
    │   ├── payments/
    │   │   ├── application/
    │   │   │   ├── ports/payment-gateway.ts  # domain-facing interface
    │   │   │   └── ports/bitcoin-ports.ts    # chain data, rates, address index
    │   │   └── infrastructure/bitcoin/
    │   │       ├── address-deriver.ts        # the ONLY file deriving addresses
    │   │       ├── esplora-chain-data-provider.ts
    │   │       ├── esplora-response.ts       # parses chain data, never casts it
    │   │       ├── mempool-rate-provider.ts
    │   │       └── redis-address-index-allocator.ts
    │   │
    │   └── identity/                          # auth, users, sessions
    │       └── ...
    │
    ├── shared/
    │   ├── domain/
    │   │   ├── entity.ts              # base Entity / AggregateRoot
    │   │   ├── value-object.ts
    │   │   ├── domain-event.ts
    │   │   ├── result.ts              # Result<T, E> — no throwing across boundaries
    │   │   └── money.ts               # integer minor units + currency, never floats
    │   ├── application/
    │   │   └── use-case.ts            # UseCase<Input, Output> interface
    │   └── infrastructure/
    │       ├── db/
    │       │   ├── client.ts          # Drizzle client
    │       │   └── schema.ts          # tables
    │       ├── redis/client.ts
    │       ├── queue/                 # BullMQ setup + workers
    │       ├── idempotency.ts         # idempotency-key helper
    │       └── logger.ts
    │
    ├── composition/
    │   └── container.ts               # wiring: pick adapters, build use cases (DI root)
    │
    └── config/
        └── env.ts                     # Zod-validated environment
```

## Key boundary rules (the ones that bite)

1. **`src/app/**` calls use cases, never repositories or bitcoin libraries directly.** Route handlers
   and server actions are thin: parse/validate input → resolve use case from the container →
   return. No business logic in the presentation layer.

2. **`domain/**` imports nothing but `shared/domain`.** No Drizzle, no bitcoin libs, no `next/*`.
   If a domain file imports an adapter, the layering is broken.

3. **Ports live in `application`, implementations in `infrastructure`.** The use case depends
   on the interface; the container injects the concrete adapter.

4. **One file derives BTC addresses** (`address-deriver.ts`) and **one imports the raw
   Drizzle client per repo.** Everything else goes through ports. This is what would make a
   second payment method a matter of implementing `PaymentGateway` — there is no card
   processor here, and no `stripe` dependency; payment is non-custodial on-chain Bitcoin
   only. See CLAUDE.md.

## Evolution path

When the admin/back-office arrives, promote to a Turborepo monorepo:
`apps/web` (this Next app) + `apps/admin` (Vite SPA) + `packages/core` (lift `src/modules`
and `src/shared` here, unchanged) + `packages/db`. Because the domain is already
framework-agnostic, that move is mostly `git mv`.
