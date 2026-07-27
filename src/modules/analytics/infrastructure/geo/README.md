# IP → location database

`dbip-city-lite.mmdb.gz` — **DB-IP IP-to-City Lite**, July 2026 release.

Resolves a visitor's country, region (state/province) and city at the moment
an analytics event is recorded (`RecordAnalyticsEvent`). Entirely local: the
file is read from disk, so nothing about a visitor's address ever leaves the
server, and there is no per-request network call.

## Why it's committed gzipped

Decompressed it is 125 MB, and GitHub rejects any file over 100 MB without
Git LFS. Gzipped it's 59 MB, which commits normally.

`MmdbIpGeoLookup` decompresses it straight into a Buffer on first use —
about 250 ms — and never writes it to disk. `maxmind.open()` would read the
whole file into memory anyway, so a temp file would cost the same memory
plus a filesystem to get wrong. The Buffer stays resident for the life of
the process (~125 MB): that's the price of region-level resolution. The
country-only database was 8 MB but carried no subdivisions at all.

## Licence and attribution

Licensed under [Creative Commons Attribution 4.0 International][cc-by].
Attribution is a condition of use, and is rendered in the admin analytics UI
as well as recorded here:

> IP geolocation by [DB-IP](https://db-ip.com)

Unlike MaxMind's GeoLite2, this database needs no account or licence key and
may be redistributed, which is why it can live in the repository.

[cc-by]: https://creativecommons.org/licenses/by/4.0/

## Accuracy

Country is reliable. **Region is good but not certain, and city is weakest** —
an address often resolves to an ISP's hub rather than the visitor's town, and
a VPN resolves to wherever it exits. Treat region and city as indications.

Addresses that only resolve to country level store `region: null`, and the
region breakdown leaves them out rather than bucketing them as "Unknown".

## Where to keep it

`IP_GEO_DB_PATH` decides. Unset, the app reads the copy committed here,
which is convenient for development and for a fresh clone.

**On a server, point it outside the working tree** — say
`/var/lib/storefront/dbip-city-lite.mmdb.gz`. The archive is 59 MB, and
committing a fresh one every month would add that to git history
permanently: a year of refreshes is roughly 700 MB that no `git gc` can
reclaim, paid by every clone forever.

## Refreshing

IP allocations move, so any snapshot goes stale. DB-IP publish monthly:

```bash
npm run geo:fetch                                  # updates the file in place
IP_GEO_DB_PATH=/var/lib/storefront/db.mmdb.gz npm run geo:fetch   # or on a server
```

The script walks back month by month until it finds a published release,
writes to a temporary file and renames it into place, so an interrupted
download can't replace a working database with a truncated one. There's no
key to rotate and nothing to schedule; a few months of drift degrades
accuracy gradually rather than breaking anything, since an unresolved
address is already an ordinary outcome.

## Seeing it work locally

`getClientIp()` reads `x-forwarded-for`. Requests to `localhost` carry only
the loopback address, which resolves to nothing — so no country or region
ever appears however much you browse.

Set `ANALYTICS_DEV_IP` in `.env` to any public address to stand in:

```
ANALYTICS_DEV_IP=8.8.8.8
```

`src/config/env.ts` forces this to `undefined` unless `NODE_ENV` is
`development`, so it cannot put a fabricated address into real data.

Location is attached **when the event is recorded**. Page views captured
before this feature existed have none and won't gain any retroactively.

## Deployment

`next.config.ts` lists this file under `outputFileTracingIncludes` so the
standalone build includes it. Without that entry Next's tracer wouldn't see
it — nothing imports the archive, it's opened by path at runtime — and
resolution would silently return `null` in production.
