import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { gunzip } from 'node:zlib';
import { promisify } from 'node:util';

import { Reader, type CityResponse } from 'maxmind';

import type { IpGeoLookup, IpLocation } from '@/modules/analytics/application/ports/ip-geo-lookup';

const gunzipAsync = promisify(gunzip);

/** Fallback location: the copy in the repo. Resolved from cwd rather than
 * `import.meta.url` so it works the same in dev, in the built server, and
 * under vitest. `IP_GEO_DB_PATH` overrides it — see `README.md` beside this
 * file for why a server should keep the archive outside the working tree. */
export const BUNDLED_DB_PATH = path.join(
  process.cwd(),
  'src/modules/analytics/infrastructure/geo/dbip-city-lite.mmdb.gz',
);

/**
 * Country/region/city lookup against a bundled DB-IP Lite database.
 *
 * Entirely local: no per-request network call, and nothing about a
 * visitor's address leaves the server.
 *
 * The database is committed gzipped (59 MB rather than 125 MB) because
 * GitHub rejects files over 100 MB without LFS. It's decompressed straight
 * into a Buffer on first use — around 250 ms — and never written to disk:
 * `maxmind.open()` would read the whole file into memory anyway, so a temp
 * file would cost the same memory plus a filesystem to get wrong.
 *
 * That Buffer stays resident for the life of the process (~125 MB). It's
 * the price of state-level resolution; the country-only database was 8 MB
 * but had no subdivisions at all.
 */
export class MmdbIpGeoLookup implements IpGeoLookup {
  /** Held as the promise rather than the resolved reader so concurrent
   * first-callers share one decompression instead of racing several. */
  private reader: Promise<Reader<CityResponse>> | null = null;

  constructor(private readonly dbPath: string = BUNDLED_DB_PATH) {}

  async lookup(ip: string): Promise<IpLocation | null> {
    try {
      this.reader ??= this.load();
      const result = (await this.reader).get(ip);

      const country = result?.country;
      const continent = result?.continent;
      if (!country?.iso_code || !continent?.code) return null;

      return {
        countryCode: country.iso_code,
        country: country.names?.en ?? country.iso_code,
        continentCode: continent.code,
        continent: continent.names?.en ?? continent.code,
        // Only the first subdivision: the second level is counties and
        // districts, which is finer than anything here reports.
        region: result?.subdivisions?.[0]?.names?.en ?? null,
        city: result?.city?.names?.en ?? null,
      };
    } catch {
      // A missing or corrupt database must not take down the pages that
      // record analytics. No location is an outcome the callers already
      // handle, so it's the right failure mode here too.
      return null;
    }
  }

  private async load(): Promise<Reader<CityResponse>> {
    const gz = await readFile(this.dbPath);
    return new Reader<CityResponse>(await gunzipAsync(gz));
  }
}
