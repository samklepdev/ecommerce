import type { CountryViews } from '@/modules/analytics/application/ports/analytics-event-repository';

/** The continents the map draws. Antarctica is omitted — it has no shape on
 * this map and no plausible traffic. */
export const MAP_CONTINENTS = [
  'North America',
  'South America',
  'Europe',
  'Africa',
  'Asia',
  'Oceania',
] as const;

export type MapContinent = (typeof MAP_CONTINENTS)[number];

export interface ContinentSummary {
  continent: MapContinent;
  views: number;
  /** The busiest country in this continent, for the hover readout. */
  topCountry: string | null;
  topCountryIp: string | null;
}

/**
 * Rolls per-country rows up to the continents the map can draw.
 *
 * Always returns every continent, including those with no traffic: the map
 * draws all of them regardless, and a missing entry would mean a landmass
 * with no fill and no tooltip rather than an explicit zero.
 */
export function summarizeByContinent(rows: CountryViews[]): ContinentSummary[] {
  const byContinent = new Map<MapContinent, ContinentSummary>(
    MAP_CONTINENTS.map((continent) => [
      continent,
      { continent, views: 0, topCountry: null, topCountryIp: null },
    ]),
  );

  for (const row of rows) {
    const summary = byContinent.get(row.continent as MapContinent);
    // A continent the map doesn't draw (Antarctica, or anything unexpected
    // from the database) is counted nowhere rather than mis-attributed.
    if (!summary) continue;

    summary.views += row.views;
    // Rows arrive busiest-first, so the first one seen for a continent is
    // its leader.
    if (summary.topCountry === null) {
      summary.topCountry = row.country;
      summary.topCountryIp = row.sampleIp;
    }
  }

  return [...byContinent.values()];
}

/** The continent with the most views, or `null` when nothing resolved. Ties
 * go to the earlier continent in `MAP_CONTINENTS`, which is arbitrary but
 * stable — a highlight that moves between reloads reads as a bug. */
export function busiestContinent(summaries: ContinentSummary[]): MapContinent | null {
  let best: ContinentSummary | null = null;
  for (const s of summaries) {
    if (s.views > 0 && (best === null || s.views > best.views)) best = s;
  }
  return best?.continent ?? null;
}
