import Link from 'next/link';

import { RANGE_PRESETS, activePreset, presetHref } from '../date-range';
import styles from './RangePresets.module.css';

export interface RangePresetsProps {
  since: Date;
  until: Date;
  /** Page to link back to, so the same control works on a drill-down. */
  basePath: string;
}

/** Preset windows as links, not a form.
 *
 * Each is a real URL, so it's shareable, bookmarkable, and works with no
 * client JS — the page is a server component and the range lives in the
 * query string either way. A range that matches no preset (arrived at from
 * a hand-edited or bookmarked URL) simply leaves none of them marked. */
export function RangePresets({ since, until, basePath }: RangePresetsProps) {
  const active = activePreset(since, until);

  return (
    <div className={styles.segmented} role="group" aria-label="Date range">
      {RANGE_PRESETS.map((days) => {
        const isActive = active === days;
        return (
          <Link
            key={days}
            href={presetHref(basePath, days)}
            className={isActive ? `${styles.option} ${styles.active}` : styles.option}
            aria-current={isActive ? 'true' : undefined}
          >
            {days}d
          </Link>
        );
      })}
    </div>
  );
}
