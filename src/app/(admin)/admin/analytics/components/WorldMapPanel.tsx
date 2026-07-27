'use client';

import dynamic from 'next/dynamic';

import type { CountryViews } from '@/modules/analytics/application/ports/analytics-event-repository';
import styles from './WorldMap.module.css';

/**
 * Loads the map only in the browser.
 *
 * Leaflet reaches for `window` as it initialises, so server-rendering it
 * throws. `ssr: false` is only allowed inside a client component, which is
 * the entire reason this wrapper exists — the page itself is a server
 * component and can't make that call.
 */
const WorldMap = dynamic(() => import('./WorldMap').then((m) => m.WorldMap), {
  ssr: false,
  // Reserves the map's height so the panel doesn't collapse and then jolt
  // the page down when the chunk lands.
  loading: () => <div className={styles.loading} />,
});

export function WorldMapPanel({ countries }: { countries: CountryViews[] }) {
  return <WorldMap countries={countries} />;
}
