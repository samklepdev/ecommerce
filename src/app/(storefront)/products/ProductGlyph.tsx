import styles from './ProductGlyph.module.css';

export type GlyphKind = 'wallet' | 'plate' | 'box' | 'card' | 'plug' | 'bag';

/** Picks a glyph from the product's category.
 *
 * A fallback for products with no image, not a replacement for one — a real
 * photo always wins. Matching on the category keeps a catalog of imageless
 * products looking like a set of instruments rather than a wall of identical
 * grey boxes. */
export function glyphForCategory(category: string | null): GlyphKind {
  const c = (category ?? '').toLowerCase();
  if (c.includes('wallet') || c.includes('hardware')) return 'wallet';
  if (c.includes('seed') || c.includes('backup') || c.includes('plate')) return 'plate';
  if (c.includes('kit') || c.includes('bundle')) return 'box';
  if (c.includes('card') || c.includes('paper')) return 'card';
  if (c.includes('cable') || c.includes('adapter') || c.includes('power')) return 'plug';
  return 'bag';
}

const PATHS: Record<GlyphKind, React.ReactNode> = {
  wallet: (
    <>
      <rect x="16" y="10" width="32" height="44" rx="3" />
      <rect x="22" y="17" width="20" height="14" rx="1" />
      <circle cx="27" cy="43" r="3" />
      <circle cx="37" cy="43" r="3" />
    </>
  ),
  plate: (
    <>
      <rect x="9" y="18" width="46" height="28" rx="2" />
      <circle cx="15" cy="24" r="1.6" />
      <circle cx="49" cy="24" r="1.6" />
      <circle cx="15" cy="40" r="1.6" />
      <circle cx="49" cy="40" r="1.6" />
      <path d="M22 27h20M22 32h20M22 37h13" />
    </>
  ),
  box: (
    <>
      <path d="M32 8 55 20v24L32 56 9 44V20z" />
      <path d="M9 20l23 12 23-12M32 32v24" />
    </>
  ),
  card: (
    <>
      <rect x="8" y="18" width="48" height="28" rx="2" />
      <rect x="14" y="25" width="11" height="9" rx="1" />
      <path d="M32 27h18M32 33h18M14 40h20" />
    </>
  ),
  plug: (
    <>
      <rect x="20" y="8" width="24" height="20" rx="10" />
      <path d="M26 8v8M38 8v8M32 28v10" />
      <rect x="22" y="38" width="20" height="18" rx="3" />
    </>
  ),
  bag: (
    <>
      <path d="M14 22h36l-4 34H18z" />
      <path d="M24 22v-6a8 8 0 0116 0v6" />
      <path d="M22 34h20" strokeDasharray="3 3" />
    </>
  ),
};

export function ProductGlyph({ kind }: { kind: GlyphKind }) {
  return (
    <svg
      className={styles.glyph}
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
    >
      {PATHS[kind]}
    </svg>
  );
}
