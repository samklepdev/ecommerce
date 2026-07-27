import { describe, expect, it } from 'vitest';

import { MmdbIpGeoLookup } from './mmdb-ip-geo-lookup';

/**
 * Runs against the committed database — no network, no DB server.
 *
 * These assertions are about the wiring, not about DB-IP's data: that the
 * file is present, is a readable mmdb, is found at the path the container
 * uses, and maps onto our `IpLocation` shape. The specific IPs are
 * long-standing anycast addresses chosen because their country is stable.
 */
describe('MmdbIpGeoLookup', () => {
  const lookup = new MmdbIpGeoLookup();

  it('resolves a well-known IPv4 address', async () => {
    const result = await lookup.lookup('8.8.8.8');

    expect(result).toEqual({
      countryCode: 'US',
      country: 'United States',
      continentCode: 'NA',
      continent: 'North America',
    });
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

  it('returns null rather than throwing when the database is missing', async () => {
    // A misdeployed file must degrade to "no country", not take down every
    // page that records an analytics event.
    const broken = new MmdbIpGeoLookup('/nonexistent/does-not-exist.mmdb');

    expect(await broken.lookup('8.8.8.8')).toBeNull();
  });
});
