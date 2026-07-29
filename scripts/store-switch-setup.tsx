/**
 * Generates the two secrets the ops URL needs, and a QR code to scan.
 *
 *   npm run store:switch-setup
 *
 * Prints the env lines to add and writes a QR image to a temp file. Nothing
 * is written into the repo: both values are secrets, and a file holding them
 * in the working tree is one `git add -A` away from being published.
 *
 * Re-running generates fresh values — which is also how you rotate, e.g.
 * after the URL has been through a log you don't control. The old code stops
 * working the moment the env changes.
 */
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { QRCodeSVG } from 'qrcode.react';

import { generateTotp, decodeBase32, totpUri } from '../src/shared/infrastructure/totp';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** 160 bits, the RFC 6238 recommendation, as 32 base32 characters. Sampled
 * rejection-free: 256 is not a multiple of 32, so a naive `% 32` would
 * favour the first 8 letters of the alphabet. */
function randomBase32(chars: number): string {
  let out = '';
  while (out.length < chars) {
    for (const byte of randomBytes(chars)) {
      if (byte >= 0xe0) continue; // 224 = 7 * 32, so the rest is uniform
      out += BASE32_ALPHABET[byte % 32];
      if (out.length === chars) break;
    }
  }
  return out;
}

/** Alphanumeric rather than base64url: the same entropy per character to
 * within a hair, but no leading `-` to make the value awkward to paste into
 * a shell or read back over the phone. */
function randomPathSegment(chars: number): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  while (out.length < chars) {
    for (const byte of randomBytes(chars)) {
      if (byte >= 0xf8) continue; // 248 = 4 * 62, keeping the draw uniform
      out += alphabet[byte % 62];
      if (out.length === chars) break;
    }
  }
  return out;
}

function main(): void {
  const path = randomPathSegment(32);
  const secret = randomBase32(32);
  const uri = totpUri(secret, 'kill switch', 'Storefront');

  const qrFile = join(tmpdir(), `store-switch-qr-${Date.now()}.svg`);
  writeFileSync(qrFile, renderToStaticMarkup(<QRCodeSVG value={uri} size={256} marginSize={4} />));

  const current = generateTotp(decodeBase32(secret)!, Math.floor(Date.now() / 1000 / 30));

  console.log(`
Add these to your production environment (never commit them):

  STORE_SWITCH_PATH=${path}
  STORE_SWITCH_TOTP_SECRET=${secret}

Your URL then is:

  https://<your-host>/api/ops/${path}?action=close&code=<6 digits>

  ...and ?action=open to reopen, ?action=status to check.
  Add &reason=... on close to note why in the audit log.

Set up your authenticator:

  1. Scan the QR code:  open ${qrFile}
     (or paste this into the app: ${uri})
  2. Check it matches — the code right now is ${current}
  3. Delete the QR file:  rm ${qrFile}

Save the URL as a bookmark or a phone shortcut. The path alone does nothing
without a current code, and a code is single-use, so a stale link in a log or
in browser history is not a working kill switch.
`);
}

main();
