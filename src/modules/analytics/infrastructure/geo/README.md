# IP → country database

`dbip-country-lite.mmdb` — **DB-IP IP-to-Country Lite**, July 2026 release.

Used to resolve a visitor's country at the moment an analytics event is
recorded (`RecordAnalyticsEvent`). Entirely local: the file is read from
disk, so nothing about a visitor's address ever leaves the server, and there
is no per-request network call.

## Licence and attribution

Licensed under [Creative Commons Attribution 4.0 International][cc-by].
Attribution is a condition of use, and is rendered in the admin analytics UI
as well as recorded here:

> IP geolocation by [DB-IP](https://db-ip.com)

Unlike MaxMind's GeoLite2, this database needs no account or licence key and
may be redistributed, which is why it can live in the repository.

[cc-by]: https://creativecommons.org/licenses/by/4.0/

## Refreshing

IP allocations move, so a committed snapshot goes stale. DB-IP publish
monthly:

```bash
curl -L -o /tmp/dbip.gz \
  "https://download.db-ip.com/free/dbip-country-lite-$(date +%Y-%m).mmdb.gz"
gunzip -c /tmp/dbip.gz > src/modules/analytics/infrastructure/geo/dbip-country-lite.mmdb
```

Then commit the result. There's no key to rotate and nothing to schedule; a
few months of drift degrades accuracy gradually rather than breaking
anything, since an unresolved address is already an ordinary outcome.

## Deployment

`next.config.ts` lists this file under `outputFileTracingIncludes` so the
standalone build includes it. Without that entry, Next's tracer wouldn't see
it — nothing imports the `.mmdb`, it's opened by path at runtime — and
country resolution would silently return `null` in production.

## Seeing it work locally

`getClientIp()` reads `x-forwarded-for`. Requests straight to `localhost`
have no such header, so every event records `unknown` as its address and no
country ever resolves — the country list and map stay empty however much you
browse.

Set `ANALYTICS_DEV_IP` in `.env` to any public address to stand in:

```
ANALYTICS_DEV_IP=8.8.8.8
```

`src/config/env.ts` forces this to `undefined` unless `NODE_ENV` is
`development`, so it cannot put a fabricated address into real data.

Note that country is attached **when the event is recorded**. Page views
captured before this feature existed have no country and won't gain one
retroactively.
