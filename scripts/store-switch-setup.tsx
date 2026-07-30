/**
 * Generates the two secrets the ops URL needs, and prints a QR code to scan.
 *
 *   npm run store:switch-setup
 *
 * Everything stays in the terminal. It used to write an SVG to a temp file,
 * which was wrong twice over: `renderToStaticMarkup` emits `<svg>` without
 * an `xmlns`, so the file was invalid as a standalone image and nothing
 * would render it — and it left a TOTP secret sitting on disk waiting to be
 * deleted by hand.
 *
 * Re-running generates fresh values — which is also how you rotate, e.g.
 * after the URL has been through a log you don't control. The old code stops
 * working the moment the env changes.
 */
import { randomBytes } from 'node:crypto';
import { renderToStaticMarkup } from 'react-dom/server';
import { QRCodeSVG } from 'qrcode.react';

import { generateTotp, decodeBase32, totpUri } from '../src/shared/infrastructure/totp';
import {
  hasFinderPatterns,
  parseQrMatrix,
  renderQrToAnsi,
} from '../src/shared/infrastructure/qr-matrix';

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

  // Rendered, read back, and structurally checked before it's shown. A QR
  // that's subtly wrong is worse than none: you'd scan it, get a secret that
  // doesn't match the server, and only find out when the switch didn't work.
  const matrix = parseQrMatrix(renderToStaticMarkup(<QRCodeSVG value={uri} size={256} />));
  const qr = matrix && hasFinderPatterns(matrix) ? renderQrToAnsi(matrix) : null;

  const current = generateTotp(decodeBase32(secret)!, Math.floor(Date.now() / 1000 / 30));

  console.log(`
Add these to your production environment (never commit them):

  STORE_SWITCH_PATH=${path}
  STORE_SWITCH_TOTP_SECRET=${secret}

Your URL then is:

  https://<your-host>/api/ops/${path}?action=close&code=<6 digits>

  ...and ?action=open to reopen, ?action=status to check.
  Add &reason=... on close to note why in the audit log.

Save it as a bookmark or a phone shortcut. The path alone does nothing
without a current code, and a code is single-use, so a stale link in a log
or in browser history is not a working kill switch.

Add it by hand:  ${uri}
Check it worked — the code right now is ${current}
`);

  // Printed last, deliberately: anything after it scrolls the code off the
  // screen, and half a QR is no QR.
  if (qr) {
    console.log('Scan with your authenticator app:\n');
    console.log(qr);
    console.log('');
  } else {
    // Never show a QR this couldn't verify — the URI above always works, and
    // every authenticator app accepts manual entry.
    console.log('(Could not render a verifiable QR code — add it by hand with the URI above.)\n');
  }
}

main();
