'use client';

import { useMemo, useState } from 'react';
import { CircleMarker, GeoJSON, MapContainer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { LatLngBounds, type Layer, type PathOptions, type StyleFunction } from 'leaflet';
import type { Feature, FeatureCollection, Geometry } from 'geojson';

// Bundled from node_modules, not Leaflet's CDN: the CSP allows no external
// stylesheet host, and a map that silently loses its layout in production is
// worse than one import here.
import 'leaflet/dist/leaflet.css';

import type {
  CityViews,
  CountryViews,
  RegionViews,
} from '@/modules/analytics/application/ports/analytics-event-repository';
import { formatCount } from '../format';
import worldGeoJson from './world-110m.json';
import statesGeoJson from './us-states-110m.json';
import styles from './WorldMap.module.css';

/** Only what we kept when slimming Natural Earth's country set. */
interface CountryProps {
  iso: string;
  name: string;
}

/** Likewise for the US state set. */
interface StateProps {
  name: string;
  code: string;
  country: string;
}

export interface WorldMapProps {
  countries: CountryViews[];
  regions: RegionViews[];
  cities: CityViews[];
}

const world = worldGeoJson as FeatureCollection<Geometry, CountryProps>;
const usStates = statesGeoJson as FeatureCollection<Geometry, StateProps>;

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

/** What the readout panel is currently describing. */
type Focus =
  | { kind: 'country'; value: CountryViews }
  | { kind: 'region'; value: RegionViews }
  | { kind: 'city'; value: CityViews };

/**
 * Page views as three nested layers: country fill, state fill on top of it,
 * and a marker per city.
 *
 * **No tile layer, deliberately.** Tiles are images fetched from a third
 * party on every pan and zoom, which this app's CSP (`img-src 'self' data:`)
 * blocks — and which would send an admin's browsing to a tile host. Every
 * polygon here is bundled, so the map renders from local assets alone.
 */
export function WorldMap({ countries, regions, cities }: WorldMapProps) {
  const [focus, setFocus] = useState<Focus | null>(null);
  const [wheelZoom, setWheelZoom] = useState(false);

  // Country names come from our own database and the geometry from Natural
  // Earth, so they're joined on ISO code — "United States" vs "United States
  // of America" would silently never match.
  const countryByIso = useMemo(
    () => new Map(countries.map((c) => [c.countryCode, c])),
    [countries],
  );

  // Regions carry no ISO code in the DB-IP data, so this join *is* by name.
  // Natural Earth and DB-IP agree on US state names, which is why the state
  // layer is US-only for now.
  const regionByName = useMemo(() => new Map(regions.map((r) => [r.region, r])), [regions]);

  const maxCountry = Math.max(...countries.map((c) => c.views), 1);
  const maxRegion = Math.max(...regions.map((r) => r.views), 1);
  const maxCity = Math.max(...cities.map((c) => c.views), 1);
  const total = countries.reduce((t, c) => t + c.views, 0);

  const countryStyle = useMemo<StyleFunction<CountryProps>>(
    () => (feature) => {
      const iso = feature?.properties?.iso;
      const views = iso ? (countryByIso.get(iso)?.views ?? 0) : 0;

      const base: PathOptions = { weight: 0.6, color: 'var(--line-strong)' };

      // Countries with no traffic stay a flat, very light wash rather than
      // disappearing — the shape of the world is the context that makes the
      // filled ones legible.
      if (views === 0) return { ...base, fillColor: 'var(--line)', fillOpacity: 0.55 };

      return { ...base, fillColor: 'var(--accent)', fillOpacity: 0.3 + (views / maxCountry) * 0.55 };
    },
    [countryByIso, maxCountry],
  );

  /** States sit on top of their country's fill, lighter, so the country
   * still reads as one shape while the busiest state stands out within it.
   * A state with no traffic draws nothing at all — a flat patch would
   * obscure the country fill beneath it for no information. */
  const stateStyle = useMemo<StyleFunction<StateProps>>(
    () => (feature) => {
      const views = feature ? (regionByName.get(feature.properties.name)?.views ?? 0) : 0;
      if (views === 0) return { stroke: false, fill: false };

      return {
        weight: 0.7,
        color: 'var(--surface)',
        fillColor: 'var(--accent-light)',
        fillOpacity: 0.4 + (views / maxRegion) * 0.5,
      };
    },
    [regionByName, maxRegion],
  );

  function onEachCountry(feature: Feature<Geometry, CountryProps>, layer: Layer) {
    const match = countryByIso.get(feature.properties.iso) ?? null;

    layer.on({
      mouseover: () => setFocus(match ? { kind: 'country', value: match } : null),
      click: () => setFocus(match ? { kind: 'country', value: match } : null),
    });
    layer.bindTooltip(
      match
        ? `${match.country}: ${formatCount(match.views)} views`
        : `${feature.properties.name}: no traffic`,
      { sticky: true, className: styles.tip },
    );
  }

  function onEachState(feature: Feature<Geometry, StateProps>, layer: Layer) {
    const match = regionByName.get(feature.properties.name);
    // No traffic means the state draws nothing, so there's nothing to hover.
    if (!match) return;

    layer.on({
      mouseover: () => setFocus({ kind: 'region', value: match }),
      click: () => setFocus({ kind: 'region', value: match }),
    });
    layer.bindTooltip(`${match.region}: ${formatCount(match.views)} views`, {
      sticky: true,
      className: styles.tip,
    });
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

        <GeoJSON data={world} style={countryStyle} onEachFeature={onEachCountry} />
        <GeoJSON data={usStates} style={stateStyle} onEachFeature={onEachState} />

        {cities.map((city) => (
          <CircleMarker
            key={`${city.country}-${city.region ?? ''}-${city.city}`}
            center={[city.latitude, city.longitude]}
            // Area scales with views, not radius — scaling the radius makes
            // a city with 4x the traffic look 16x bigger.
            radius={4 + Math.sqrt(city.views / maxCity) * 7}
            pathOptions={{
              color: 'var(--amber)',
              fillColor: 'var(--amber)',
              fillOpacity: 0.75,
              weight: 1.5,
            }}
            eventHandlers={{
              mouseover: () => setFocus({ kind: 'city', value: city }),
              click: () => setFocus({ kind: 'city', value: city }),
            }}
          >
            <Tooltip direction="top" offset={[0, -4]} className={styles.tip}>
              {city.city}
              {city.region ? `, ${city.region}` : ''} — {formatCount(city.views)} views
            </Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>

      <div className={styles.readout}>
        {focus ? (
          <FocusFacts focus={focus} />
        ) : (
          <span className={styles.hint}>Hover a country, state or city.</span>
        )}

        <ul className={styles.legend}>
          <li>
            <span className={`${styles.key} ${styles.keyCountry}`} /> Country
          </li>
          <li>
            <span className={`${styles.key} ${styles.keyState}`} /> State
          </li>
          <li>
            <span className={`${styles.key} ${styles.keyCity}`} /> City
          </li>
        </ul>
      </div>

      <p className={styles.credit}>
        {wheelZoom
          ? 'Scroll to zoom · pointer out to release'
          : 'Drag to pan · click the map to scroll-zoom'}
        {' · '}
        State shading is US-only · Outlines: Natural Earth (public domain)
      </p>
    </div>
  );
}

/** The readout's contents differ by what's hovered — a city has no sample
 * IP, a country has no parent to name — so each gets its own shape rather
 * than one set of fields with blanks in it. */
function FocusFacts({ focus }: { focus: Focus }) {
  if (focus.kind === 'city') {
    const city = focus.value;
    return (
      <>
        <span className={styles.title}>{city.city}</span>
        <dl className={styles.facts}>
          <div>
            <dt>In</dt>
            <dd>{[city.region, city.country].filter(Boolean).join(', ')}</dd>
          </div>
          <div>
            <dt>Page views</dt>
            <dd className={styles.mono}>{formatCount(city.views)}</dd>
          </div>
          <div>
            <dt>Coordinates</dt>
            <dd className={styles.mono}>
              {city.latitude.toFixed(2)}, {city.longitude.toFixed(2)}
            </dd>
          </div>
        </dl>
      </>
    );
  }

  if (focus.kind === 'region') {
    const region = focus.value;
    return (
      <>
        <span className={styles.title}>{region.region}</span>
        <dl className={styles.facts}>
          <div>
            <dt>In</dt>
            <dd>{region.country}</dd>
          </div>
          <div>
            <dt>Top city</dt>
            <dd>{region.topCity ?? '—'}</dd>
          </div>
          <div>
            <dt>Page views</dt>
            <dd className={styles.mono}>{formatCount(region.views)}</dd>
          </div>
        </dl>
      </>
    );
  }

  const country = focus.value;
  return (
    <>
      <span className={styles.title}>{country.country}</span>
      <dl className={styles.facts}>
        <div>
          <dt>Continent</dt>
          <dd>{country.continent}</dd>
        </div>
        <div>
          <dt>Sample address</dt>
          <dd className={styles.mono}>{country.sampleIp ?? '—'}</dd>
        </div>
        <div>
          <dt>Page views</dt>
          <dd className={styles.mono}>{formatCount(country.views)}</dd>
        </div>
      </dl>
    </>
  );
}
