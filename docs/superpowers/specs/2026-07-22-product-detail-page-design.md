# Product detail page: more depth + discovery

## Context

Last item on the user's personal todo list (the other three CSS/data fixes
shipped in PR #24). Today `/products/[slug]` is bare: gallery, name, a
plain-text description, a flat variant list, and a shipping note. Nothing
links back to the product's category, the description can't do more than
one unstyled paragraph, and there's no path from one product to another
except going back to the full `/products` grid.

Explicitly out of scope for this pass (both flagged during brainstorming as
much bigger lifts): customer reviews/ratings (needs a whole new subsystem —
submission, moderation, storage) and a structured key/value spec table
(needs a new field on `Product`/schema; today's `description` is a single
text blob).

## 1. Breadcrumb

Above the gallery: `Home / <Category> / <Product Name>`, only rendered when
`product.category` is set (already nullable free text on `Product` — no
schema change). The category segment links to
`/products?category=<category>`, reusing the existing category-filter
query param exactly as `CategoryFilterSelect` does today. `Home` links to
`/products`. The product-name segment is plain text (current page, not a
link).

New reusable `src/components/ui/Breadcrumb.tsx`:

```ts
interface Crumb { label: string; href?: string; }
interface BreadcrumbProps { items: Crumb[]; }
```

Renders an `<nav aria-label="Breadcrumb">` with a `>`-separated list; the
last item is never a link even if `href` is passed, matching standard
breadcrumb semantics (you're already on that page). No new use case or
data fetch — `product.category` and `product.name` are already on the
`Product` the page fetches via `getProductBySlug`.

## 2. Markdown description

Add `react-markdown` as a dependency. `product.description` (unchanged
`text` column, unchanged admin textarea) is rendered through
`<ReactMarkdown>{product.description}</ReactMarkdown>` instead of a plain
`<p>`. This is full standard markdown for free — paragraphs, bold/italic,
ordered/unordered lists, links — not a restricted subset; restricting it
would mean writing extra code to strip syntax the library already renders
correctly, which isn't worth it for a single-admin product-copy field.

Wrapped in a CSS module (`.descriptionBody` in `page.module.css`) that
styles `p`/`ul`/`ol`/`li`/`a`/`strong`/`em` to match the page's existing
type scale — react-markdown emits plain semantic HTML tags, so this is
pure CSS, no custom renderer components needed.

`react-markdown` (v9+) is a pure function of its `children` prop with no
browser-only APIs, so it renders fine as part of the existing Server
Component tree — no `'use client'` needed for this piece.

## 3. "You might also like"

Rendered below the variant list, before the shipping note. Server-side,
composed from the **existing** `listProducts` use case (no new use case):

1. `listProducts.execute({ category: product.category, limit: 5 })` if
   `product.category` is set; otherwise skip straight to step 2.
2. Filter out the current product id from the result. If fewer than 4
   remain, call `listProducts.execute({ sort: 'newest', limit: 8 })` and
   append products not already included and not the current product,
   until 4 total or the fallback list is exhausted.
3. If the combined result is empty (only possible on a store with a
   single product), the whole section is omitted.

Rendered via a new shared `ProductCardMini` component (extracted from the
card markup currently inlined in `src/app/(storefront)/products/page.tsx`,
so the listing grid and this new row render identically instead of
maintaining two copies of the same card JSX) inside a horizontally-laid-out
`.relatedGrid` (CSS grid/flex, wraps on narrow viewports — no carousel).
Each card links to `/products/[slug]`; no quick-add button here (keeps the
row lightweight — quick-add stays a listing-page feature).

## 4. Recently viewed

Personalized, so it cannot be part of the ISR'd page body (`CLAUDE.md`:
never cache personalized data) — it's a client component that fetches
after mount.

**New port method** on `ProductRepository`
(`src/modules/catalog/application/ports/product-repository.ts`):

```ts
/** Active-only; ids that don't resolve (deleted/archived/never existed)
 * are silently omitted, not errored. Order of the returned array is not
 * guaranteed to match the input order. */
findByIds(ids: string[]): Promise<Product[]>;
```

Implemented in `DrizzleProductRepository` as a single `WHERE id IN (...)
AND status = 'active'` query reusing the existing relational-hydration
path (same pattern as the rest of the repository).

**New use case** `src/modules/catalog/application/use-cases/get-products-by-ids.ts`:

```ts
export interface GetProductsByIdsInput { productIds: string[]; }
```

Thin pass-through to `productRepository.findByIds`, capping the input to
8 ids defensively (mirrors how other list use cases cap `limit`).

**New server action** `getRecentlyViewedProductsAction` (new file
`src/app/actions/products.ts`, or added to wherever storefront product
actions already live if such a file exists — confirm during planning):
Zod-validates `{ productIds: string[] }` (max 8, each a non-empty string),
calls the use case, returns a plain summary array (`id`, `slug`, `name`,
`imageUrl`, `price`) shaped for `ProductCardMini`.

**New client component** `src/app/(storefront)/products/[slug]/RecentlyViewed.tsx`:
- On mount: read a JSON array of product ids from
  `localStorage['recentlyViewed']` (capped at 8, most-recent-first).
- Remove the current product's id if present, then unshift it to the
  front, re-truncate to 8, write back to `localStorage`.
- Call `getRecentlyViewedProductsAction` with the *other* (non-current)
  ids from that list.
- Render nothing if the list of other ids is empty, or if the action
  returns zero products.
- Rendered via `ProductCardMini` in the same `.relatedGrid` style as
  "You might also like", in its own section beneath it, titled "Recently
  viewed".

This is the one piece of the page that needs `'use client'` — everything
else in this design stays a Server Component.

## Error handling & caching

- Product detail page keeps `revalidate = 3600`; the breadcrumb, markdown
  description, and related-products section are all part of that cached
  render — none of them are personalized.
- Recently-viewed is excluded from the ISR'd HTML entirely by virtue of
  being a separate client component that fetches post-mount — consistent
  with the project's rule to never bake personalized data into a cached
  page.
- `findByIds` / the recently-viewed action never error on a stale/deleted
  id — they just return fewer results. No error state is shown to the
  customer for this.

## Testing

- Unit: `GetProductsByIds` (empty input, mixed valid/invalid/archived ids,
  the 8-id cap).
- No new use-case-level tests needed for the related-products logic — it's
  two calls to the already-tested `ListProducts` use case composed in the
  page component, not new application logic.
- Manual/live verification (per this project's established practice of
  verifying against the real DB before considering a UI feature done):
  - Breadcrumb category link round-trips to the correctly filtered
    `/products` page; hidden entirely for an uncategorized product.
  - A real product description edited to include **bold**, a bullet list,
    and a link renders correctly.
  - "You might also like" shows same-category products for a categorized
    product, and falls back to newest-storewide for an uncategorized one
    (or one whose category has < 4 other active products).
  - Recently-viewed accumulates across repeated page visits in a real
    browser, excludes the product currently being viewed, and survives a
    page reload (persisted in `localStorage`, not component state).

## Out of scope (explicitly deferred, not forgotten)

- Customer reviews/ratings — new subsystem (submission, moderation,
  storage, likely a moderation queue in `/admin`), a separate
  brainstorm-and-spec cycle of its own.
- Structured spec/attribute table — needs a schema change to `Product`
  (today's `description` is one text field); worth a separate design once
  there's a concrete need for what attributes to capture (weight,
  dimensions, material, etc. presumably vary a lot by product type).
