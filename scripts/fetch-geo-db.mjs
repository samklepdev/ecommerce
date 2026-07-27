#!/usr/bin/env node
/**
 * Downloads the current DB-IP IP-to-City Lite database.
 *
 * DB-IP publish monthly and keep only recent releases, so this walks back
 * from this month until it finds one — a fresh checkout on the 1st would
 * otherwise fail for no good reason.
 *
 * Writes to $IP_GEO_DB_PATH when set, otherwise to the in-repo location.
 * On a server, set IP_GEO_DB_PATH to somewhere outside the working tree
 * (e.g. /var/lib/storefront/dbip-city-lite.mmdb.gz): the archive is ~59 MB
 * and committing a new one every month would grow git history by that much
 * forever.
 *
 *   npm run geo:fetch
 */

import { mkdir, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_PATH = 'src/modules/analytics/infrastructure/geo/dbip-city-lite.mmdb.gz';
const MONTHS_TO_TRY = 6;
/** Anything smaller than this isn't the database — it's an error page. */
const MIN_PLAUSIBLE_BYTES = 10 * 1024 * 1024;

function releaseTag(monthsAgo) {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - monthsAgo);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const target = path.resolve(process.env.IP_GEO_DB_PATH ?? DEFAULT_PATH);

for (let i = 0; i < MONTHS_TO_TRY; i++) {
  const tag = releaseTag(i);
  const url = `https://download.db-ip.com/free/dbip-city-lite-${tag}.mmdb.gz`;
  process.stdout.write(`trying ${tag}… `);

  let response;
  try {
    response = await fetch(url);
  } catch (error) {
    console.log(`network error (${error.message})`);
    continue;
  }

  if (!response.ok) {
    console.log(`HTTP ${response.status}`);
    continue;
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < MIN_PLAUSIBLE_BYTES) {
    console.log(`too small (${bytes.length} bytes) — not the database`);
    continue;
  }

  // Written alongside then renamed, so an interrupted download can't leave a
  // truncated file where a working one used to be.
  await mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.partial`;
  await writeFile(temp, bytes);
  await rename(temp, target);

  const { size } = await stat(target);
  console.log(`ok — ${(size / 1024 / 1024).toFixed(1)} MB written to ${target}`);
  process.exit(0);
}

console.error(
  `\nNo DB-IP release found in the last ${MONTHS_TO_TRY} months.\n` +
    'Check https://db-ip.com/db/download/ip-to-city-lite for the current URL.',
);
process.exit(1);
