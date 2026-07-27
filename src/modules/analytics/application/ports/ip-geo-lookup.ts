export interface IpLocation {
  /** ISO 3166-1 alpha-2, e.g. `US`. */
  countryCode: string;
  /** English country name, e.g. `United States`. */
  country: string;
  /** Two-letter continent code, e.g. `NA`. */
  continentCode: string;
  /** English continent name, e.g. `North America`. */
  continent: string;
  /** First-level subdivision — a state, province or region, e.g.
   * `California`. `null` for countries that have none, and for addresses
   * the database only resolves to country level. */
  region: string | null;
  /** e.g. `Mountain View`. `null` when unresolved. Cities are much less
   * reliable than countries: an address commonly resolves to the ISP's
   * hub rather than the visitor's town. */
  city: string | null;
}

/**
 * Resolves a request IP to a location.
 *
 * A port because the source is a swappable detail: today it's a bundled
 * DB-IP database read from disk, but a CDN geo header or a paid feed would
 * implement the same shape without anything upstream changing.
 */
export interface IpGeoLookup {
  /** `null` for a private, loopback, reserved or simply unknown address —
   * every caller must handle "no location" as an ordinary outcome, not an
   * error, since local development produces it constantly. */
  lookup(ip: string): Promise<IpLocation | null>;
}
