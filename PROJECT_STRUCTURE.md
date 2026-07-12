# Project Structure & Architecture

A Next.js (App Router) storefront built on Clean Architecture / DDD principles. The web
framework and the payment provider are both **adapters** — the domain never imports them.

## Stack

| Concern            | Choice                          | Why |
| ------------------ | ------------------------------- | --- |
| Framework          | Next.js (App Router)            | SSR/ISR for crawlable, fast product pages |
| Language           | TypeScript (strict)             | — |
| DB                 | PostgreSQL                      | Transactions + row locking for inventory |
| ORM                | Drizzle                         | SQL-close control for locking & atomic updates |
| Cache / sessions   | Redis                           | Carts, idempotency keys, reservation TTLs, rate limits |
| Queue              | BullMQ (on Redis)               | Webhooks side effects, email, fulfillment |
| Payments           | Stripe (hosted Elements)        | PANs never touch our servers (PCI scope) |
| Tax                | Stripe Tax / TaxJar             | Never hand-roll jurisdiction logic |
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
- **infrastructure** — adapters: Drizzle repos, Stripe client, Redis, BullMQ, email.
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
    │   │   ├── webhooks/
    │   │   │   └── stripe/route.ts  # webhook = source of truth for payment state
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
    │   │   │   ├── product-variant.ts
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
    │   ├── inventory/
    │   │   ├── domain/
    │   │   │   └── stock-item.ts
    │   │   ├── application/
    │   │   │   ├── ports/inventory-repository.ts
    │   │   │   └── use-cases/
    │   │   │       ├── reserve-stock.ts      # decrement → reserved w/ TTL
    │   │   │       └── release-reservation.ts
    │   │   └── infrastructure/
    │   │       └── drizzle-inventory-repository.ts   # SELECT ... FOR UPDATE
    │   │
    │   ├── checkout/
    │   │   ├── application/
    │   │   │   └── use-cases/
    │   │   │       └── start-checkout.ts     # reprice + reserve + create PaymentIntent
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
    │   │   │       ├── mark-order-paid.ts    # driven by Stripe webhook only
    │   │   │       └── refund-order.ts
    │   │   └── infrastructure/
    │   │       └── drizzle-order-repository.ts
    │   │
    │   ├── payments/
    │   │   ├── application/
    │   │   │   └── ports/payment-gateway.ts  # domain-facing interface
    │   │   └── infrastructure/
    │   │       └── stripe-payment-gateway.ts # the only file that imports `stripe`
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

1. **`src/app/**` calls use cases, never repositories or Stripe directly.** Route handlers
   and server actions are thin: parse/validate input → resolve use case from the container →
   return. No business logic in the presentation layer.

2. **`domain/**` imports nothing but `shared/domain`.** No Drizzle, no Stripe, no `next/*`.
   If a domain file imports an adapter, the layering is broken.

3. **Ports live in `application`, implementations in `infrastructure`.** The use case depends
   on the interface; the container injects the concrete adapter.

4. **One file imports `stripe`** (`stripe-payment-gateway.ts`) and **one imports the raw
   Drizzle client per repo.** Everything else goes through ports. This is what makes the
   payment provider swappable.

## Evolution path

When the admin/back-office arrives, promote to a Turborepo monorepo:
`apps/web` (this Next app) + `apps/admin` (Vite SPA) + `packages/core` (lift `src/modules`
and `src/shared` here, unchanged) + `packages/db`. Because the domain is already
framework-agnostic, that move is mostly `git mv`.
