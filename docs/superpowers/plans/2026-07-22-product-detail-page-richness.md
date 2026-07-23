# Product Detail Page Richness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a breadcrumb, markdown-rendered description, a "You might also like" row, and a "Recently viewed" row to `/products/[slug]`, per `docs/superpowers/specs/2026-07-22-product-detail-page-design.md`.

**Architecture:** Everything but "Recently viewed" stays in the existing Server Component (`page.tsx`), composed from existing/new use cases — no new route, no new page-level data-fetching pattern. "Recently viewed" is the one client-only piece (personalized `localStorage` state), fetching via a new server action after mount. A new shared `ProductCardMini` component removes the duplicate card markup that would otherwise exist between the `/products` grid and the two new rows.

**Tech Stack:** Next.js App Router (Server + Client Components), Drizzle ORM, Zod, Vitest, `react-markdown` (new dependency).

## Global Constraints

- Never use floats for money; all price display goes through existing `Money`/`.toDisplayString()` — no new arithmetic here (this feature only reads existing prices, never computes new ones).
- `src/app/**` calls use cases only, never repositories directly — the two new server-visible operations (`findByIds` on the repository) go through a new `GetProductsByIds` use case.
- Wire every new use case in `src/composition/container.ts` — the single DI root.
- Domain and use-case tests must run without a database or network.
- Never cache personalized data — "Recently viewed" must not be part of the ISR'd page body (stays a client component fetching post-mount).
- Files: `kebab-case.ts` for non-component files; `PascalCase.tsx` for components, matching existing convention in this directory.

---

### Task 1: `Product.cheapestVariantPrice` domain getter

**Files:**
- Modify: `src/modules/catalog/domain/product.ts`
- Test: `src/modules/catalog/domain/product.test.ts`

**Interfaces:**
- Produces: `Product#cheapestVariantPrice: Money | null` — used by Task 4's `toProductCardSummary` to get a display price for cards that don't have a selected variant (related products, recently viewed).

- [ ] **Step 1: Write the failing test**

Add to `src/modules/catalog/domain/product.test.ts` (after the existing `Product#findVariant` describe block):

```ts
describe('Product#cheapestVariantPrice', () => {
  it('is null when there are no variants', () => {
    expect(Product.create(makeProps({ variants: [] })).cheapestVariantPrice).toBeNull();
  });

  it('is the single variant price when there is only one', () => {
    const product = Product.create(makeProps());
    expect(product.cheapestVariantPrice?.amountMinor).toBe(1999);
  });

  it('is the lowest-priced variant among several', () => {
    const cheap = ProductVariant.create({
      id: randomUUID(),
      productId: randomUUID(),
      sku: 'WIDGET-CHEAP',
      name: 'Cheap',
      price: Money.of(500, 'USD'),
    });
    const expensive = ProductVariant.create({
      id: randomUUID(),
      productId: randomUUID(),
      sku: 'WIDGET-EXPENSIVE',
      name: 'Expensive',
      price: Money.of(5000, 'USD'),
    });
    const product = Product.create(makeProps({ variants: [expensive, cheap] }));
    expect(product.cheapestVariantPrice?.amountMinor).toBe(500);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- product.test.ts`
Expected: FAIL — `cheapestVariantPrice` does not exist on `Product` (TS error surfaces as a test failure/compile error).

- [ ] **Step 3: Write minimal implementation**

In `src/modules/catalog/domain/product.ts`, add the getter right after the existing `hoverImageUrl` getter:

```ts
  /** The lowest-priced variant's price — for display contexts with no
   * specific variant selected yet (e.g. "You might also like" cards). Null
   * only if the product has no variants at all. */
  get cheapestVariantPrice(): Money | null {
    if (this.variants.length === 0) return null;
    return this.variants.reduce((min, v) =>
      v.price.amountMinor < min.price.amountMinor ? v : min,
    ).price;
  }
```

Add `Money` to the existing imports at the top of the file:

```ts
import type { Money } from '@/shared/domain/money';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- product.test.ts`
Expected: PASS (all `Product` tests, including the 3 new ones).

- [ ] **Step 5: Commit**

```bash
git add src/modules/catalog/domain/product.ts src/modules/catalog/domain/product.test.ts
git commit -m "feat(catalog): add Product#cheapestVariantPrice getter"
```

---

### Task 2: `ProductRepository.findByIds` (port + Drizzle implementation)

**Files:**
- Modify: `src/modules/catalog/application/ports/product-repository.ts`
- Modify: `src/modules/catalog/infrastructure/drizzle-product-repository.ts`

**Interfaces:**
- Produces: `ProductRepository#findByIds(ids: string[]): Promise<Product[]>` — active-only, ids that don't resolve are silently omitted. Consumed by Task 3's `GetProductsByIds` use case.

- [ ] **Step 1: Add the method to the port**

In `src/modules/catalog/application/ports/product-repository.ts`, add to the `ProductRepository` interface, right after `findVariantById`:

```ts
  /** Active-only; ids that don't resolve (deleted/archived/never existed)
   * are silently omitted, not errored. Returned order is not guaranteed to
   * match `ids`' order — callers that need a specific order must re-sort. */
  findByIds(ids: string[]): Promise<Product[]>;
```

- [ ] **Step 2: Implement it in `DrizzleProductRepository`**

In `src/modules/catalog/infrastructure/drizzle-product-repository.ts`, add this method right after `findVariantById` (reuses the same `variantsFor`/`imagesFor` private helpers and `toProduct` mapper the rest of the file already uses):

```ts
  async findByIds(ids: string[]): Promise<Product[]> {
    if (ids.length === 0) return [];
    const rows = await this.db.query.products.findMany({
      where: and(inArray(products.id, ids), eq(products.status, 'active')),
    });
    if (rows.length === 0) return [];

    const [variantsByProduct, imagesByProduct] = await Promise.all([
      this.variantsFor(rows.map((r) => r.id)),
      this.imagesFor(rows.map((r) => r.id)),
    ]);
    return rows.map((row) =>
      toProduct(row, variantsByProduct.get(row.id) ?? [], imagesByProduct.get(row.id) ?? []),
    );
  }
```

No new imports needed — `and`, `eq`, `inArray` are already imported at the top of this file.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS (this is infra code with no unit test per this project's rule that only domain/use-case tests run without a database — this method is verified live in Task 10).

- [ ] **Step 4: Commit**

```bash
git add src/modules/catalog/application/ports/product-repository.ts src/modules/catalog/infrastructure/drizzle-product-repository.ts
git commit -m "feat(catalog): add ProductRepository.findByIds"
```

---

### Task 3: `GetProductsByIds` use case + container wiring

**Files:**
- Create: `src/modules/catalog/application/use-cases/get-products-by-ids.ts`
- Test: `src/modules/catalog/application/use-cases/get-products-by-ids.test.ts`
- Modify: `src/composition/container.ts`

**Interfaces:**
- Consumes: `ProductRepository#findByIds` (Task 2).
- Produces: `GetProductsByIds#execute({ productIds: string[] }): Promise<Product[]>`, exposed on the container as `getProductsByIds`. Consumed by Task 8's server action.

- [ ] **Step 1: Write the failing test**

Create `src/modules/catalog/application/use-cases/get-products-by-ids.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { GetProductsByIds } from './get-products-by-ids';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';
import type { Product } from '@/modules/catalog/domain/product';

describe('GetProductsByIds', () => {
  it('returns an empty array without querying the repository when given no ids', async () => {
    let called = false;
    const repo: Partial<ProductRepository> = {
      async findByIds() {
        called = true;
        return [];
      },
    };

    const result = await new GetProductsByIds(repo as ProductRepository).execute({ productIds: [] });

    expect(result).toEqual([]);
    expect(called).toBe(false);
  });

  it('delegates to the repository for a normal id list', async () => {
    const repo: Partial<ProductRepository> = {
      async findByIds(ids) {
        return ids.map((id) => ({ id }) as Product);
      },
    };

    const result = await new GetProductsByIds(repo as ProductRepository).execute({
      productIds: ['a', 'b'],
    });

    expect(result.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('caps the id list at 8 before querying the repository', async () => {
    let received: string[] = [];
    const repo: Partial<ProductRepository> = {
      async findByIds(ids) {
        received = ids;
        return [];
      },
    };
    const tooMany = Array.from({ length: 10 }, (_, i) => `id-${i}`);

    await new GetProductsByIds(repo as ProductRepository).execute({ productIds: tooMany });

    expect(received).toHaveLength(8);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- get-products-by-ids.test.ts`
Expected: FAIL — cannot find module `./get-products-by-ids`.

- [ ] **Step 3: Write minimal implementation**

Create `src/modules/catalog/application/use-cases/get-products-by-ids.ts`:

```ts
import type { UseCase } from '@/shared/application/use-case';
import type { Product } from '@/modules/catalog/domain/product';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';

const MAX_IDS = 8;

export interface GetProductsByIdsInput {
  productIds: string[];
}

export class GetProductsByIds implements UseCase<GetProductsByIdsInput, Product[]> {
  constructor(private readonly products: ProductRepository) {}

  async execute(input: GetProductsByIdsInput): Promise<Product[]> {
    if (input.productIds.length === 0) return [];
    return this.products.findByIds(input.productIds.slice(0, MAX_IDS));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- get-products-by-ids.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire into the container**

In `src/composition/container.ts`:

Add the import near the other catalog use-case imports (next to `GetProductBySlug`):

```ts
import { GetProductsByIds } from '@/modules/catalog/application/use-cases/get-products-by-ids';
```

Add to the container's type/interface block, next to `getProductBySlug: GetProductBySlug;`:

```ts
  getProductsByIds: GetProductsByIds;
```

Add the instantiation, next to `const getProductBySlug = new GetProductBySlug(products);`:

```ts
  const getProductsByIds = new GetProductsByIds(products);
```

Add to the returned container object, next to `getProductBySlug,`:

```ts
    getProductsByIds,
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/modules/catalog/application/use-cases/get-products-by-ids.ts src/modules/catalog/application/use-cases/get-products-by-ids.test.ts src/composition/container.ts
git commit -m "feat(catalog): add GetProductsByIds use case"
```

---

### Task 4: Extract `ProductCardMini` and refactor the `/products` grid to use it

**Files:**
- Create: `src/app/(storefront)/products/ProductCardMini.tsx`
- Create: `src/app/(storefront)/products/ProductCardMini.module.css`
- Modify: `src/app/(storefront)/products/page.tsx`
- Modify: `src/app/(storefront)/products/page.module.css`

**Interfaces:**
- Produces: `ProductCardSummary` type, `toProductCardSummary(product: Product): ProductCardSummary`, `<ProductCardMini product={summary}>{children}</ProductCardMini>` (renders image + title; `children` renders below the title — the listing page passes `AddToCartRow`, later tasks pass a plain price span). Consumed by this task's `page.tsx` refactor, and by Tasks 7 and 9.

This task has no new business logic (pure UI extraction), so it's verified by typecheck + a manual page load rather than a new unit test — matches this project's existing pattern of not unit-testing presentational components.

- [ ] **Step 1: Create the shared card component**

Create `src/app/(storefront)/products/ProductCardMini.module.css` — these rules are moved verbatim from `page.module.css` (renamed `.productCard` → `.card`), plus one new `.price` rule:

```css
.card {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  transition: border-color 0.15s ease;
}

.card:hover {
  border-color: var(--color-accent);
}

.mediaLink {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  color: inherit;
  text-decoration: none;
  font-weight: 500;
}

/* Reserves space for exactly two lines, whether this title actually wraps
   or not — so content below it always starts at the same vertical offset
   across every card in a row, regardless of title length. Anything longer
   than two lines truncates with an ellipsis instead of pushing further
   down. */
.title {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.3;
  min-height: calc(1.3em * 2);
}

.imageStack {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
}

.image {
  width: 100%;
  height: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  border-radius: var(--radius-sm);
  background: var(--background);
}

.hoverImage {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: var(--radius-sm);
  opacity: 0;
  transition: opacity 0.15s ease;
}

.card:hover .hoverImage {
  opacity: 1;
}

.imagePlaceholder {
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: var(--radius-sm);
  background: var(--color-border);
}

.price {
  color: var(--color-muted);
  font-size: 0.875rem;
}
```

Create `src/app/(storefront)/products/ProductCardMini.tsx`:

```tsx
import type { ReactNode } from 'react';
import Link from 'next/link';

import { Card } from '@/components/ui/Card';
import type { Product } from '@/modules/catalog/domain/product';
import styles from './ProductCardMini.module.css';

export interface ProductCardSummary {
  id: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  hoverImageUrl: string | null;
  priceDisplay: string | null;
}

export function toProductCardSummary(product: Product): ProductCardSummary {
  return {
    id: product.id,
    slug: product.slug.value,
    name: product.name,
    imageUrl: product.imageUrl,
    hoverImageUrl: product.hoverImageUrl,
    priceDisplay: product.cheapestVariantPrice?.toDisplayString() ?? null,
  };
}

interface ProductCardMiniProps {
  product: ProductCardSummary;
  /** Rendered below the title — e.g. a quick-add row on the listing page,
   * or a plain price span on the "related"/"recently viewed" rows. */
  children?: ReactNode;
}

export function ProductCardMini({ product, children }: ProductCardMiniProps) {
  return (
    <Card className={styles.card}>
      <Link href={`/products/${product.slug}`} className={styles.mediaLink}>
        {product.imageUrl ? (
          <div className={styles.imageStack}>
            {/* Supplier image hosts are dynamic/admin-added, not known at build time. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={product.imageUrl} alt={product.name} className={styles.image} />
            {product.hoverImageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.hoverImageUrl}
                alt=""
                aria-hidden
                className={styles.hoverImage}
              />
            )}
          </div>
        ) : (
          <div className={styles.imagePlaceholder} aria-hidden />
        )}
        <span className={styles.title}>{product.name}</span>
      </Link>
      {children}
    </Card>
  );
}
```

- [ ] **Step 2: Refactor `products/page.tsx` to use it**

In `src/app/(storefront)/products/page.tsx`, add the import next to the other local imports:

```ts
import { ProductCardMini, toProductCardSummary } from './ProductCardMini';
```

Replace the grid's card markup (the `<Card key={product.id} className={styles.productCard}>...</Card>` block) with:

```tsx
            {pagedProducts.map((product) => {
              const quickAdd = quickAddByProductId.get(product.id) ?? null;
              return (
                <ProductCardMini key={product.id} product={toProductCardSummary(product)}>
                  {quickAdd && (
                    <AddToCartRow
                      variantId={quickAdd.variant.id}
                      priceDisplay={quickAdd.variant.price.toDisplayString()}
                      disabled={!quickAdd.isAvailable}
                    />
                  )}
                </ProductCardMini>
              );
            })}
```

`Card` and `Link` may now be unused in this file — remove their imports only if no other usage remains (check the rest of the file first; `Card` is likely still used elsewhere, `Link` may not be).

- [ ] **Step 3: Remove the now-duplicated rules from `page.module.css`**

In `src/app/(storefront)/products/page.module.css`, delete `.productCard`, `.mediaLink`, `.title`, `.imageStack`, `.image`, `.hoverImage`, `.imagePlaceholder` (all moved to `ProductCardMini.module.css` in Step 1). Keep `.empty`, `.filters`, `.searchForm`, `.grid`.

- [ ] **Step 4: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS. If `Link` or `Card` show as unused imports in `page.tsx`, remove them.

- [ ] **Step 5: Manual check**

Run: `npm run dev`, visit `/products`. Expected: grid renders identically to before (same images, hover-swap, title clamp, quick-add row) — this step is a pure refactor, so nothing should visibly change.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(storefront\)/products/ProductCardMini.tsx src/app/\(storefront\)/products/ProductCardMini.module.css src/app/\(storefront\)/products/page.tsx src/app/\(storefront\)/products/page.module.css
git commit -m "refactor(storefront): extract ProductCardMini from the products grid"
```

---

### Task 5: `Breadcrumb` UI component + wire it into the product detail page

**Files:**
- Create: `src/components/ui/Breadcrumb.tsx`
- Create: `src/components/ui/Breadcrumb.module.css`
- Modify: `src/app/(storefront)/products/[slug]/page.tsx`

**Interfaces:**
- Produces: `<Breadcrumb items={[{label, href?}, ...]} />` — last item is never a link.

- [ ] **Step 1: Create the component**

Create `src/components/ui/Breadcrumb.module.css`:

```css
.nav {
  font-size: 0.875rem;
  color: var(--color-muted);
}

.list {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-1);
  list-style: none;
}

.separator {
  color: var(--color-muted);
}

.link {
  color: inherit;
}
```

Create `src/components/ui/Breadcrumb.tsx`:

```tsx
import Link from 'next/link';

import styles from './Breadcrumb.module.css';

export interface Crumb {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: Crumb[];
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className={styles.nav}>
      <ol className={styles.list}>
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={i}>
              {i > 0 && <span className={styles.separator}> / </span>}
              {!isLast && item.href ? (
                <Link href={item.href} className={styles.link}>
                  {item.label}
                </Link>
              ) : (
                <span>{item.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
```

- [ ] **Step 2: Wire it into the product detail page**

In `src/app/(storefront)/products/[slug]/page.tsx`, add the import:

```ts
import { Breadcrumb } from '@/components/ui/Breadcrumb';
```

Add, as the first child inside `<Stack gap={5}>`, right before `<ProductGallery ... />`:

```tsx
        {product.category && (
          <Breadcrumb
            items={[
              { label: 'Home', href: '/products' },
              { label: product.category, href: `/products?category=${encodeURIComponent(product.category)}` },
              { label: product.name },
            ]}
          />
        )}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Manual check**

Run: `npm run dev`, visit a product with a category set — expect a breadcrumb above the gallery, and clicking the category segment lands on `/products?category=<that category>` with the filter applied. Visit a product with no category — expect no breadcrumb at all.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/Breadcrumb.tsx src/components/ui/Breadcrumb.module.css "src/app/(storefront)/products/[slug]/page.tsx"
git commit -m "feat(storefront): add breadcrumb to the product detail page"
```

---

### Task 6: Markdown-rendered description

**Files:**
- Modify: `package.json` (new dependency)
- Modify: `src/app/(storefront)/products/[slug]/page.tsx`
- Modify: `src/app/(storefront)/products/[slug]/page.module.css`

**Interfaces:** None new — this task only changes how an existing field (`product.description`) is rendered.

- [ ] **Step 1: Install the dependency**

Run: `npm install react-markdown`
Expected: `package.json`'s `dependencies` gains a `"react-markdown": "^..."` entry; `package-lock.json` updates.

- [ ] **Step 2: Render the description through it**

In `src/app/(storefront)/products/[slug]/page.tsx`, add the import:

```ts
import ReactMarkdown from 'react-markdown';
```

Replace:

```tsx
          {product.description && <p className={styles.description}>{product.description}</p>}
```

with:

```tsx
          {product.description && (
            <div className={styles.description}>
              <ReactMarkdown>{product.description}</ReactMarkdown>
            </div>
          )}
```

- [ ] **Step 3: Style the rendered markdown**

In `src/app/(storefront)/products/[slug]/page.module.css`, replace the existing `.description` rule (currently styled as a single `<p>`) with:

```css
.description {
  color: var(--color-muted);
  margin-top: var(--space-2);
}

.description p {
  margin: 0 0 var(--space-2);
}

.description p:last-child {
  margin-bottom: 0;
}

.description ul,
.description ol {
  margin: 0 0 var(--space-2);
  padding-left: 1.25rem;
}

.description a {
  color: var(--color-accent);
}
```

- [ ] **Step 4: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5: Manual check**

Edit a product's description in `/admin/products` to include `**bold text**`, a `- bullet\n- list`, and a `[link](https://example.com)`; reload the product page. Expected: bold renders bold, the list renders as an actual `<ul>`, the link is clickable. A plain-text description (no markdown syntax) with no blank lines still renders as one paragraph, matching today's behavior.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json "src/app/(storefront)/products/[slug]/page.tsx" "src/app/(storefront)/products/[slug]/page.module.css"
git commit -m "feat(storefront): render product descriptions as markdown"
```

---

### Task 7: "You might also like" section

**Files:**
- Modify: `src/app/(storefront)/products/[slug]/page.tsx`
- Modify: `src/app/(storefront)/products/[slug]/page.module.css`

**Interfaces:**
- Consumes: existing `listProducts` use case (already in the container), `ProductCardMini`/`toProductCardSummary`/`ProductCardSummary` from Task 4.
- Produces: `.sectionTitle` and `.relatedGrid` CSS classes in this page's module, reused by Task 9's `RecentlyViewed` component.

- [ ] **Step 1: Add the related-products resolver and section**

In `src/app/(storefront)/products/[slug]/page.tsx`, add these imports. The existing `import styles from './page.module.css';` line stays as-is; add a second, aliased import for the card's own CSS module so it doesn't collide with `styles`:

```ts
import type { Product } from '@/modules/catalog/domain/product';
import { ProductCardMini, toProductCardSummary } from '../ProductCardMini';
import cardStyles from '../ProductCardMini.module.css';
```

Add this function above the `ProductPage` component, after the existing `generateMetadata`:

```ts
const RELATED_LIMIT = 4;
const RELATED_FALLBACK_LIMIT = 12;

/** Same-category products first (excluding this one); if that's short,
 * fills remaining slots with the newest active products storewide. */
async function resolveRelatedProducts(
  product: Product,
  listProducts: ReturnType<typeof getContainer>['listProducts'],
): Promise<Product[]> {
  const sameCategory = product.category
    ? (await listProducts.execute({ category: product.category, limit: RELATED_LIMIT + 1 })).items
    : [];

  const related = sameCategory.filter((p) => p.id !== product.id).slice(0, RELATED_LIMIT);
  const excludeIds = new Set([product.id, ...related.map((p) => p.id)]);

  if (related.length < RELATED_LIMIT) {
    const fallback = (
      await listProducts.execute({ sort: 'newest', limit: RELATED_FALLBACK_LIMIT })
    ).items;
    for (const p of fallback) {
      if (related.length >= RELATED_LIMIT) break;
      if (!excludeIds.has(p.id)) {
        related.push(p);
        excludeIds.add(p.id);
      }
    }
  }

  return related;
}
```

In the `ProductPage` component, after `const shippingRate = await getShippingRate.execute();`, add:

```ts
  const relatedProducts = await resolveRelatedProducts(product, listProducts);
```

`listProducts` must be destructured from `getContainer()` alongside the existing `getProductBySlug, getPreferredOfferForVariant, getShippingRate` — update that destructuring line to:

```ts
  const { getProductBySlug, getPreferredOfferForVariant, getShippingRate, listProducts } = getContainer();
```

Add the section markup, after the `<p className={styles.shippingNote}>...</p>` line and before the closing `</Stack>`:

```tsx
        {relatedProducts.length > 0 && (
          <div>
            <h2 className={styles.sectionTitle}>You might also like</h2>
            <div className={styles.relatedGrid}>
              {relatedProducts.map((related) => {
                const summary = toProductCardSummary(related);
                return (
                  <ProductCardMini key={summary.id} product={summary}>
                    {summary.priceDisplay && (
                      <span className={cardStyles.price}>{summary.priceDisplay}</span>
                    )}
                  </ProductCardMini>
                );
              })}
            </div>
          </div>
        )}
```

- [ ] **Step 2: Add the new styles**

In `src/app/(storefront)/products/[slug]/page.module.css`, add:

```css
.sectionTitle {
  font-size: 1.125rem;
  margin-bottom: var(--space-3);
}

.relatedGrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: var(--space-4);
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 4: Manual check**

Visit a categorized product with 4+ other products in the same category — expect 4 same-category cards. Visit an uncategorized product, or one whose category has fewer than 4 other active products — expect the remaining slots filled with the newest active products storewide, none of them the product itself. On a store with exactly one active product, expect the section to not render at all.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(storefront)/products/[slug]/page.tsx" "src/app/(storefront)/products/[slug]/page.module.css"
git commit -m "feat(storefront): add a \"You might also like\" section to the product page"
```

---

### Task 8: `getRecentlyViewedProductsAction` server action

**Files:**
- Create: `src/app/actions/products.ts`

**Interfaces:**
- Consumes: `getProductsByIds` (Task 3), `toProductCardSummary`/`ProductCardSummary` (Task 4).
- Produces: `getRecentlyViewedProductsAction(productIds: string[]): Promise<ProductCardSummary[]>` — consumed by Task 9's client component.

- [ ] **Step 1: Write the action**

Create `src/app/actions/products.ts`:

```ts
'use server';

import { z } from 'zod';

import { getContainer } from '@/composition/container';
import { toProductCardSummary, type ProductCardSummary } from '@/app/(storefront)/products/ProductCardMini';

const GetRecentlyViewedSchema = z.array(z.string().min(1)).max(8);

export async function getRecentlyViewedProductsAction(
  productIds: string[],
): Promise<ProductCardSummary[]> {
  const parsed = GetRecentlyViewedSchema.safeParse(productIds);
  if (!parsed.success) return [];

  const { getProductsByIds } = getContainer();
  const products = await getProductsByIds.execute({ productIds: parsed.data });
  return products.map(toProductCardSummary);
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/actions/products.ts
git commit -m "feat(storefront): add getRecentlyViewedProductsAction"
```

---

### Task 9: `RecentlyViewed` client component, wired into the detail page

**Files:**
- Create: `src/app/(storefront)/products/[slug]/RecentlyViewed.tsx`
- Modify: `src/app/(storefront)/products/[slug]/page.tsx`

**Interfaces:**
- Consumes: `getRecentlyViewedProductsAction` (Task 8), `ProductCardMini`/`ProductCardSummary` (Task 4), `.sectionTitle`/`.relatedGrid` from `page.module.css` (Task 7).
- Produces: `<RecentlyViewed currentProductId={product.id} />`.

This is the one client-only, `localStorage`-dependent piece of the feature — not meaningfully unit-testable without heavy DOM/storage mocking that wouldn't catch real bugs, so it's verified live in Step 4 below, consistent with the spec's testing section.

- [ ] **Step 1: Write the component**

Create `src/app/(storefront)/products/[slug]/RecentlyViewed.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';

import { getRecentlyViewedProductsAction } from '@/app/actions/products';
import { ProductCardMini, type ProductCardSummary } from '../ProductCardMini';
import cardStyles from '../ProductCardMini.module.css';
import styles from './page.module.css';

const STORAGE_KEY = 'recentlyViewed';
const MAX_STORED = 8;

function readStoredIds(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function writeStoredIds(ids: string[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Storage disabled/full (e.g. private browsing) — feature degrades to
    // "no memory across visits", not an error worth surfacing.
  }
}

interface RecentlyViewedProps {
  currentProductId: string;
}

export function RecentlyViewed({ currentProductId }: RecentlyViewedProps) {
  const [products, setProducts] = useState<ProductCardSummary[]>([]);

  useEffect(() => {
    const previouslyStored = readStoredIds().filter((id) => id !== currentProductId);
    const updated = [currentProductId, ...previouslyStored].slice(0, MAX_STORED);
    writeStoredIds(updated);

    const otherIds = previouslyStored.slice(0, MAX_STORED - 1);
    if (otherIds.length === 0) {
      setProducts([]);
      return;
    }

    let cancelled = false;
    getRecentlyViewedProductsAction(otherIds).then((result) => {
      if (!cancelled) setProducts(result);
    });
    return () => {
      cancelled = true;
    };
  }, [currentProductId]);

  if (products.length === 0) return null;

  return (
    <div>
      <h2 className={styles.sectionTitle}>Recently viewed</h2>
      <div className={styles.relatedGrid}>
        {products.map((product) => (
          <ProductCardMini key={product.id} product={product}>
            {product.priceDisplay && (
              <span className={cardStyles.price}>{product.priceDisplay}</span>
            )}
          </ProductCardMini>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the detail page**

In `src/app/(storefront)/products/[slug]/page.tsx`, add the import:

```ts
import { RecentlyViewed } from './RecentlyViewed';
```

Add, as the last child inside `<Stack gap={5}>`, right after the "You might also like" block from Task 7:

```tsx
        <RecentlyViewed currentProductId={product.id} />
```

- [ ] **Step 3: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 4: Manual check (live, in a real browser)**

Run `npm run dev`. Visit product A, then product B, then product C. On product C's page, expect "Recently viewed" to show A and B (not C itself). Reload product C's page — expect the same two to still show (persisted in `localStorage`, not component state). Open dev tools → Application → Local Storage and confirm a `recentlyViewed` key holding a JSON array of product ids, capped at 8. On a fresh browser profile (or after clearing that key), visiting a product for the first time ever should render no "Recently viewed" section at all.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(storefront)/products/[slug]/RecentlyViewed.tsx" "src/app/(storefront)/products/[slug]/page.tsx"
git commit -m "feat(storefront): add a Recently viewed section to the product page"
```

---

### Task 10: Full verification pass, `docs/features.md`, and PR

**Files:**
- Modify: `docs/features.md`

- [ ] **Step 1: Full check**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all PASS.

- [ ] **Step 2: Live DB verification**

With local Postgres/Redis running (`docker-compose` services already up per this project's convention), write a throwaway `scripts/_verify-product-detail-richness.ts` that, via `getContainer()`:
1. Fetches two categorized products in the same category and calls `listProducts.execute({ category, limit: 5 })` — confirm both come back.
2. Calls `getProductsByIds.execute({ productIds: [an active id, a made-up id, an archived product's id] })` — confirm only the active one comes back.
3. Calls it again with 10 ids — confirm only 8 are queried (log the array length the fake/real repo receives, or just confirm no error and a sane result).

Run via `npx tsx --env-file=.env scripts/_verify-product-detail-richness.ts`, confirm output matches expectations, then delete the script (`git status` should show it untracked and removed, not committed).

- [ ] **Step 3: Manual browser pass**

Run `npm run dev` and click through: breadcrumb (Task 5), markdown description (Task 6), "You might also like" fallback behavior for both a categorized and an uncategorized product (Task 7), and the recently-viewed flow across 3 products (Task 9) — repeating the checks from each task's own manual-check step in one connected pass, since a real user will hit all four in sequence on one page load.

- [ ] **Step 4: Update `docs/features.md`**

Replace the existing "Product detail" bullet in the "Storefront (customers)" section with:

```markdown
- **Product detail** (`/products/[slug]`) — image gallery, all variants
  with price and availability, add to cart. "Out of stock" means the
  supplier marked it unavailable, not a quantity count — this store holds
  no inventory (dropship/arbitrage model). A breadcrumb links back to the
  product's category filter when it has one. The description supports
  markdown (bold, lists, links), not just plain text. Below the variants,
  a "You might also like" row shows other products from the same category
  (falling back to the newest storewide products if the category is thin
  or the product has none), and a "Recently viewed" row shows the last few
  products the visitor looked at, remembered in their browser across
  visits.
```

- [ ] **Step 5: Commit the docs update**

```bash
git add docs/features.md
git commit -m "docs: describe the richer product detail page in features.md"
```

- [ ] **Step 6: Push and open a PR**

Per this project's established practice, ask the user for confirmation before pushing/opening a PR. Once confirmed:

```bash
git push -u origin feat/product-detail-page-richness
gh pr create --title "Richer product detail page: breadcrumb, markdown, related + recently viewed" --body "$(cat <<'EOF'
## Summary
- Breadcrumb linking back to the product's category filter.
- Product descriptions now render as markdown (bold, lists, links) via `react-markdown`, instead of one plain-text paragraph.
- A "You might also like" row (same-category products, falling back to newest storewide).
- A "Recently viewed" row, persisted per-browser in localStorage.
- Extracted a shared `ProductCardMini` component so the `/products` grid and these two new rows render identical cards instead of duplicating the markup.

## Test plan
- [ ] `npm run typecheck && npm run lint && npm test`
- [ ] Live DB verification of `findByIds`/`GetProductsByIds` (active-only filtering, 8-id cap)
- [ ] Manual browser pass: breadcrumb, markdown rendering, related-products fallback (categorized + uncategorized product), recently-viewed accumulation across page loads

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Report the resulting PR URL to the user.
