import { existsSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { BUNDLED_DB_PATH, MmdbIpGeoLookup } from './mmdb-ip-geo-lookup';

/**
 * The database is gitignored — 59 MB, refreshed monthly — so a fresh clone
 * or an offline machine legitimately has none. The data assertions skip in
 * that case rather than failing: a missing optional asset isn't a broken
 * build, and red for a reason that isn't your code teaches people to ignore
 * red. Run `npm run geo:fetch` to fetch it; CI does exactly that.
 *
 * The degradation test below always runs, because it needs no database by
 * definition.
 */
const hasDatabase = existsSync(BUNDLED_DB_PATH);

describe('MmdbIpGeoLookup without a database', () => {
  it('returns null rather than throwing when the file is missing', async () => {
    // A misdeployed or unfetched file must degrade to "no location", not
    // take down every page that records an analytics event.
    const broken = new MmdbIpGeoLookup('/nonexistent/does-not-exist.mmdb.gz');

    expect(await broken.lookup('8.8.8.8')).toBeNull();
  });
});

/**
 * These assert the wiring, not DB-IP's data: that the archive is present,
 * decompresses, is found at the path the container uses, and maps onto our
 * `IpLocation` shape. The IPs are long-standing anycast addresses chosen
 * because their location is stable.
 */
describe.skipIf(!hasDatabase)('MmdbIpGeoLookup', () => {
  const lookup = new MmdbIpGeoLookup();

  it('resolves a well-known IPv4 address down to its region', async () => {
    const result = await lookup.lookup('8.8.8.8');

    expect(result).toMatchObject({
      countryCode: 'US',
      country: 'United States',
      continentCode: 'NA',
      continent: 'North America',
      region: 'California',
    });
  });

  it('carries coordinates for the resolved city', async () => {
    // Straight from the database — the map places a point without any
    // geocoding step.
    const result = await lookup.lookup('8.8.8.8');

    expect(result?.city).toBe('Mountain View');
    expect(result?.latitude).toBeCloseTo(37.4, 1);
    expect(result?.longitude).toBeCloseTo(-122.1, 1);
  });

  it('resolves regions outside the US too', async () => {
    expect((await lookup.lookup('82.165.1.1'))?.region).toBe('Hesse');
    expect((await lookup.lookup('1.1.1.1'))?.region).toBe('New South Wales');
  });

  it('resolves IPv6 as well as IPv4', async () => {
    const result = await lookup.lookup('2001:4860:4860::8888');

    expect(result?.continentCode).toBe('NA');
  });

  it('returns null for a loopback address', async () => {
    // The normal case in local development — callers must treat "no
    // location" as ordinary, not as a failure.
    expect(await lookup.lookup('127.0.0.1')).toBeNull();
  });

  it('returns null for a private range address', async () => {
    expect(await lookup.lookup('10.0.0.1')).toBeNull();
    expect(await lookup.lookup('192.168.1.1')).toBeNull();
  });

  it('returns null rather than throwing on a malformed address', async () => {
    expect(await lookup.lookup('not-an-ip')).toBeNull();
  });

  it('decompresses the database only once across many lookups', async () => {
    // The archive is ~125 MB decompressed; doing that per lookup would be
    // ruinous. Concurrent first-callers must share one load.
    const fresh = new MmdbIpGeoLookup();
    const results = await Promise.all(
      ['8.8.8.8', '1.1.1.1', '82.165.1.1', '8.8.4.4'].map((ip) => fresh.lookup(ip)),
    );

    expect(results.every((r) => r !== null)).toBe(true);
  });
});
