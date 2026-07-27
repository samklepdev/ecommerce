'use client';

import { useMemo, useState } from 'react';
import { GeoJSON, MapContainer, useMap, useMapEvents } from 'react-leaflet';
import { LatLngBounds, type Layer, type PathOptions, type StyleFunction } from 'leaflet';
import type { Feature, FeatureCollection, Geometry } from 'geojson';

// Bundled from node_modules, not Leaflet's CDN: the CSP allows no external
// stylesheet host, and a map that silently loses its layout in production is
// worse than one import here.
import 'leaflet/dist/leaflet.css';

import type { CountryViews } from '@/modules/analytics/application/ports/analytics-event-repository';
import { formatCount } from '../format';
import worldGeoJson from './world-110m.json';
import styles from './WorldMap.module.css';

/** Only what we kept when slimming Natural Earth's 110m country set. */
interface CountryProps {
  iso: string;
  name: string;
}

export interface WorldMapProps {
  countries: CountryViews[];
}

const world = worldGeoJson as FeatureCollection<Geometry, CountryProps>;

/** Stops a drag from wandering off into empty grey either side of the
 * world. Latitude is clamped short of the poles, where the Mercator
 * projection stretches to infinity. */
const WORLD_BOUNDS = new LatLngBounds([-60, -180], [85, 180]);

/**
 * Wheel-zoom is off until the map is clicked, and off again once the
 * pointer leaves.
 *
 * The admin content area scrolls, so a map that grabbed the wheel on hover
 * would trap the page every time you scrolled past it. Clicking is an
 * explicit "I'm using the map now"; the buttons and drag work regardless.
 */
function WheelZoomOnFocus({ onChange }: { onChange: (enabled: boolean) => void }) {
  const map = useMap();

  useMapEvents({
    click() {
      map.scrollWheelZoom.enable();
      onChange(true);
    },
    mouseout() {
      map.scrollWheelZoom.disable();
      onChange(false);
    },
  });

  return null;
}

/**
 * Page views as a country choropleth.
 *
 * **No tile layer, deliberately.** Tiles are images fetched from a third
 * party on every pan and zoom, which this app's CSP (`img-src 'self' data:`)
 * blocks — and which would send an admin's browsing to a tile host. The
 * country polygons are bundled, so the map renders entirely from local
 * assets. Adding imagery later means relaxing the CSP for one tile host.
 */
export function WorldMap({ countries }: WorldMapProps) {
  const [hovered, setHovered] = useState<CountryViews | null>(null);
  const [wheelZoom, setWheelZoom] = useState(false);

  // Country names come from our own database and the geometry from Natural
  // Earth, so they're joined on ISO code rather than on name — "United
  // States" vs "United States of America" would silently never match.
  const byIso = useMemo(() => {
    const map = new Map<string, CountryViews>();
    for (const c of countries) map.set(c.countryCode, c);
    return map;
  }, [countries]);

  const max = Math.max(...countries.map((c) => c.views), 1);
  const total = countries.reduce((t, c) => t + c.views, 0);

  const style = useMemo<StyleFunction<CountryProps>>(
    () => (feature) => {
      const iso = feature?.properties?.iso;
      const views = iso ? (byIso.get(iso)?.views ?? 0) : 0;

      const base: PathOptions = {
        weight: 0.6,
        color: 'var(--line-strong)',
        fillColor: 'var(--accent)',
      };

      // Countries with no traffic stay a flat, very light wash rather than
      // disappearing — the shape of the world is the context that makes the
      // filled ones legible.
      if (views === 0) return { ...base, fillColor: 'var(--line)', fillOpacity: 0.55 };

      return { ...base, fillOpacity: 0.25 + (views / max) * 0.6 };
    },
    [byIso, max],
  );

  function onEachCountry(feature: Feature<Geometry, CountryProps>, layer: Layer) {
    const match = byIso.get(feature.properties.iso) ?? null;

    layer.on({
      mouseover: () => setHovered(match),
      mouseout: () => setHovered(null),
      // Touch has no hover; a tap fills the readout instead.
      click: () => setHovered(match),
    });

    // Native tooltip so the figure is reachable without the readout panel.
    layer.bindTooltip(
      match
        ? `${match.country}: ${formatCount(match.views)} views`
        : `${feature.properties.name}: no traffic`,
      { sticky: true, className: styles.tip },
    );
  }

  if (total === 0) {
    return (
      <p className={styles.empty}>
        No traffic has resolved to a country yet. Country comes from the
        visitor&apos;s IP, and requests to localhost carry no forwarded
        address — set <code>ANALYTICS_DEV_IP</code> to see this populate in
        development, or deploy behind a proxy that sets{' '}
        <code>x-forwarded-for</code>.
      </p>
    );
  }

  return (
    <div className={styles.wrap}>
      <MapContainer
        className={styles.map}
        center={[20, 0]}
        zoom={2}
        minZoom={2}
        maxZoom={7}
        maxBounds={WORLD_BOUNDS}
        // Springs back rather than hard-stopping at the edge, which reads as
        // the map being broken.
        maxBoundsViscosity={0.8}
        zoomControl
        // Enabled on click by WheelZoomOnFocus — see there for why.
        scrollWheelZoom={false}
        dragging
        doubleClickZoom
        touchZoom
        keyboard
        attributionControl={false}
      >
        <WheelZoomOnFocus onChange={setWheelZoom} />
        <GeoJSON data={world} style={style} onEachFeature={onEachCountry} />
      </MapContainer>

      <div className={styles.readout}>
        {hovered ? (
          <>
            <span className={styles.country}>{hovered.country}</span>
            <dl className={styles.facts}>
              <div>
                <dt>Continent</dt>
                <dd>{hovered.continent}</dd>
              </div>
              <div>
                <dt>Sample address</dt>
                <dd className={styles.mono}>{hovered.sampleIp ?? '—'}</dd>
              </div>
              <div>
                <dt>Page views</dt>
                <dd className={styles.mono}>{formatCount(hovered.views)}</dd>
              </div>
            </dl>
          </>
        ) : (
          <span className={styles.hint}>Hover a country.</span>
        )}
      </div>

      {/* Natural Earth is public domain and asks for no attribution, but
          saying where the geometry came from costs a line. */}
      <p className={styles.credit}>
        {wheelZoom ? 'Scroll to zoom · pointer out to release' : 'Drag to pan · click the map to scroll-zoom'}
        {' · '}
        Country outlines: Natural Earth (public domain)
      </p>
    </div>
  );
}
