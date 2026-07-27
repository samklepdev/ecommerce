'use client';

import { useState } from 'react';

import { cx } from '@/components/ui/cx';
import { formatCount } from '../format';
import type { ContinentSummary, MapContinent } from '../continents';
import styles from './ContinentMap.module.css';

export interface ContinentMapProps {
  summaries: ContinentSummary[];
  /** Drawn with the accent fill — the answer to "where is most of my
   * traffic coming from". */
  busiest: MapContinent | null;
}

/**
 * Simplified continent shapes, not a projection.
 *
 * Deliberately geometric: an approximate outline that reads as a diagram
 * sits better beside the rest of this console than a detailed coastline
 * would, and it needs no map library or geometry asset. Positions are
 * roughly true so the shapes are recognisable at a glance.
 */
const SHAPES: Record<MapContinent, string> = {
  'North America': 'M60 40 L215 34 L232 78 L196 108 L176 152 L146 178 L124 152 L128 116 L92 96 L58 70 Z',
  'South America': 'M170 196 L214 190 L228 232 L208 292 L182 316 L164 286 L156 236 Z',
  Europe: 'M392 44 L470 38 L486 66 L462 96 L414 104 L386 82 Z',
  Africa: 'M396 118 L484 112 L500 168 L470 246 L436 288 L410 246 L392 178 Z',
  Asia: 'M494 30 L716 42 L742 96 L700 150 L604 168 L530 148 L500 100 Z',
  Oceania: 'M660 214 L744 208 L762 256 L716 284 L668 268 Z',
};

/** Fill weight by share of the busiest continent, so the map carries
 * magnitude and not just presence. */
function intensity(views: number, max: number): number {
  if (views === 0) return 0;
  return 0.18 + (views / max) * 0.62;
}

export function ContinentMap({ summaries, busiest }: ContinentMapProps) {
  const [hovered, setHovered] = useState<MapContinent | null>(null);

  const max = Math.max(...summaries.map((s) => s.views), 1);
  const total = summaries.reduce((t, s) => t + s.views, 0);
  const active = summaries.find((s) => s.continent === (hovered ?? busiest)) ?? null;

  if (total === 0) {
    return (
      <p className={styles.empty}>
        No traffic has resolved to a country yet. Private and loopback
        addresses have no location, so this fills in once the site is
        reachable from the public internet.
      </p>
    );
  }

  return (
    <div className={styles.wrap}>
      <svg
        viewBox="0 0 800 330"
        className={styles.map}
        role="img"
        aria-label="Page views by continent"
      >
        {summaries.map((summary) => {
          const isBusiest = summary.continent === busiest;
          const isHovered = hovered === summary.continent;

          return (
            <path
              key={summary.continent}
              d={SHAPES[summary.continent]}
              className={cx(styles.landmass, isBusiest && styles.busiest)}
              style={{ fillOpacity: isHovered ? 0.92 : intensity(summary.views, max) }}
              onMouseEnter={() => setHovered(summary.continent)}
              onMouseLeave={() => setHovered(null)}
              tabIndex={0}
              onFocus={() => setHovered(summary.continent)}
              onBlur={() => setHovered(null)}
            >
              {/* Native title so the figures are reachable without a pointer
                  and without JavaScript. */}
              <title>
                {summary.continent}: {formatCount(summary.views)} views
              </title>
            </path>
          );
        })}
      </svg>

      {/* A fixed panel rather than a tooltip chasing the cursor across the
          map — it can't cover a landmass, and it has somewhere to sit when
          nothing is hovered. */}
      <div className={styles.readout}>
        {active && active.views > 0 ? (
          <>
            <span className={styles.continent}>
              {active.continent}
              {active.continent === busiest && !hovered && (
                <span className={styles.badge}>busiest</span>
              )}
            </span>
            <dl className={styles.facts}>
              <div>
                <dt>Top country</dt>
                <dd>{active.topCountry ?? '—'}</dd>
              </div>
              <div>
                <dt>Sample address</dt>
                <dd className={styles.mono}>{active.topCountryIp ?? '—'}</dd>
              </div>
              <div>
                <dt>Page views</dt>
                <dd className={styles.mono}>{formatCount(active.views)}</dd>
              </div>
            </dl>
          </>
        ) : (
          <span className={styles.hint}>
            {hovered ? `No traffic from ${hovered} in this range.` : 'Hover a continent.'}
          </span>
        )}
      </div>
    </div>
  );
}
