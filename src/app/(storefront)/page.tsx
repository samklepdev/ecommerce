export { default } from './products/page';

// Route segment config can't be re-exported (Next.js parses it statically
// per-file) — kept in sync with products/page.tsx's own `dynamic` export.
export const dynamic = 'force-dynamic';
