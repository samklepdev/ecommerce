import type { CSSProperties } from 'react';

import styles from './Skeleton.module.css';

interface SkeletonProps {
  /** Any CSS length. Default fills its container. */
  width?: string;
  height?: number;
  /** Spacing below, for stacking several into a paragraph shape. */
  marginBottom?: number;
}

/** A loading placeholder shaped like the content it stands in for.
 * Decorative, so it's hidden from assistive tech — the live region that
 * announces the load belongs with whatever is fetching. */
export function Skeleton({ width = '100%', height = 14, marginBottom = 0 }: SkeletonProps) {
  const style = { width, height, marginBottom } as CSSProperties;
  return <span className={styles.skeleton} style={style} aria-hidden="true" />;
}
