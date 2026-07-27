import path from 'node:path';

import maxmind, { type Reader, type CountryResponse } from 'maxmind';

import type { IpGeoLookup, IpLocation } from '@/modules/analytics/application/ports/ip-geo-lookup';

/** Ships in the repo — see `README.md` beside the file for licence and
 * refresh instructions. Resolved from cwd rather than `import.meta.url` so
 * it works the same in dev, in the built server, and under vitest. */
const DEFAULT_DB_PATH = path.join(
  process.cwd(),
  'src/modules/analytics/infrastructure/geo/dbip-country-lite.mmdb',
);

/**
 * Country lookup against a bundled DB-IP Lite database.
 *
 * Entirely local: no per-request network call, nothing about a visitor's
 * address leaves the server. The reader memory-maps the file once and
 * answers in microseconds, so callers can hit it on every event.
 */
export class MmdbIpGeoLookup implements IpGeoLookup {
  /** Opened once, lazily. Held as the promise rather than the resolved
   * reader so concurrent first-callers share a single open. */
  private reader: Promise<Reader<CountryResponse>> | null = null;

  constructor(private readonly dbPath: string = DEFAULT_DB_PATH) {}

  async lookup(ip: string): Promise<IpLocation | null> {
    try {
      this.reader ??= maxmind.open<CountryResponse>(this.dbPath);
      const result = (await this.reader).get(ip);

      const country = result?.country;
      const continent = result?.continent;
      if (!country?.iso_code || !continent?.code) return null;

      return {
        countryCode: country.iso_code,
        country: country.names?.en ?? country.iso_code,
        continentCode: continent.code,
        continent: continent.names?.en ?? continent.code,
      };
    } catch {
      // A missing or corrupt database must not take down the pages that
      // record analytics. No location is an outcome the callers already
      // handle, so it's the right failure mode here too.
      return null;
    }
  }
}
