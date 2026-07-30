/**
 * Generates the two secrets the ops URL needs, and prints a QR code to scan.
 *
 *   npm run store:switch-setup            # generate and print
 *   npm run store:switch-setup -- --write  # ...and write them into .env
 *   npm run store:switch-setup -- --show   # QR for what's already configured
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
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { QRCodeSVG } from 'qrcode.react';

import { env } from '../src/config/env';
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

const KEYS = ['STORE_SWITCH_PATH', 'STORE_SWITCH_TOTP_SECRET'] as const;

/** Renders the QR, verifying it structurally first — a subtly wrong QR is
 * worse than none, since you'd scan it and only find out when the switch
 * didn't work. */
function renderQr(uri: string): string | null {
  const matrix = parseQrMatrix(renderToStaticMarkup(<QRCodeSVG value={uri} size={256} />));
  return matrix && hasFinderPatterns(matrix) ? renderQrToAnsi(matrix) : null;
}

function printQr(qr: string | null): void {
  // Printed last, deliberately: anything after it scrolls the code off the
  // screen, and half a QR is no QR.
  if (qr) {
    console.log('Scan with your authenticator app:\n');
    console.log(qr);
    console.log('');
  } else {
    console.log('(Could not render a verifiable QR code — add it by hand with the URI above.)\n');
  }
}

/** The QR for the secret already in the environment, for when you've written
 * it but not yet paired a device — or have paired a new one. */
function showConfigured(): void {
  const path = env.STORE_SWITCH_PATH;
  const secret = env.STORE_SWITCH_TOTP_SECRET;

  if (!path || !secret) {
    console.error('Nothing configured: set STORE_SWITCH_PATH and STORE_SWITCH_TOTP_SECRET first, or run this without --show to generate them.');
    process.exit(1);
  }

  const decoded = decodeBase32(secret);
  if (!decoded) {
    console.error('STORE_SWITCH_TOTP_SECRET is not valid base32 — it should be 32 characters of A-Z and 2-7.');
    process.exit(1);
  }

  const uri = totpUri(secret, 'kill switch', 'Storefront');
  console.log(`
Your URL is:

  ${env.APP_URL}/api/ops/${path}?action=close&code=<6 digits>

Add it by hand:  ${uri}

Your authenticator should be showing ${generateTotp(decoded, Math.floor(Date.now() / 1000 / 30))} right now. That is a check,
not a setting — it changes every 30 seconds and belongs in no file.
`);
  printQr(renderQr(uri));
}

/**
 * Writes both values into `.env`, replacing the keys if they're already
 * there (even blank) and appending them if not.
 *
 * This exists because the copy step is where it goes wrong: the printout
 * carries a 32-character secret *and* a 6-digit verification code, and
 * pasting the code into `STORE_SWITCH_TOTP_SECRET` fails validation and
 * stops the whole app from booting. One less thing to hand-carry.
 *
 * Refuses to overwrite values that are already set — losing a secret an
 * authenticator is already paired with means silently breaking the switch.
 */
function writeToEnvFile(values: Record<(typeof KEYS)[number], string>): 'written' | 'occupied' {
  const file = '.env';
  const existing = existsSync(file) ? readFileSync(file, 'utf8') : '';

  for (const key of KEYS) {
    const current = new RegExp(`^${key}=(.+)$`, 'm').exec(existing);
    if (current && current[1]!.trim() !== '') return 'occupied';
  }

  let next = existing;
  for (const key of KEYS) {
    const line = `${key}=${values[key]}`;
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    next = pattern.test(next)
      ? next.replace(pattern, line)
      : `${next}${next.endsWith('\n') || next === '' ? '' : '\n'}${line}\n`;
  }

  writeFileSync(file, next);
  return 'written';
}

function main(): void {
  const write = process.argv.includes('--write');
  // `--show` prints the QR for whatever is already configured, generating
  // nothing. Without it there'd be no way back to the QR for a secret you
  // already wrote — and re-running would hand you a new one, silently
  // breaking the switch your authenticator is paired with.
  const show = process.argv.includes('--show');

  if (show) {
    showConfigured();
    return;
  }

  const path = randomPathSegment(32);
  const secret = randomBase32(32);
  const uri = totpUri(secret, 'kill switch', 'Storefront');

  const qr = renderQr(uri);

  const current = generateTotp(decodeBase32(secret)!, Math.floor(Date.now() / 1000 / 30));

  const outcome = write ? writeToEnvFile({ STORE_SWITCH_PATH: path, STORE_SWITCH_TOTP_SECRET: secret }) : null;

  // Generating without writing, while something different is already
  // configured, is how you end up with a URL that 404s and a phone paired
  // to a secret the server has never heard of. Say so up front — the values
  // below are a proposal, not the state of the system.
  if (!write && env.STORE_SWITCH_PATH && env.STORE_SWITCH_PATH !== path) {
    console.log(`
  ⚠  A different STORE_SWITCH_PATH is already configured.

     What follows is NEW and does nothing until you put both values in
     place and restart. The URL you may already have bookmarked, and the
     entry already in your authenticator, belong to the configured pair —
     see them with:  npm run store:switch-setup -- --show
`);
  }

  if (outcome === 'occupied') {
    console.error(`
Refusing to overwrite: .env already has STORE_SWITCH values.

Clear them first if you really mean to rotate — whatever is paired with your
authenticator right now will stop working.
`);
    process.exit(1);
  }

  console.log(
    outcome === 'written'
      ? `
Written to .env. Restart the dev server — env is read at boot.

  STORE_SWITCH_PATH=${path}
  STORE_SWITCH_TOTP_SECRET=(written to .env)

Your URL is:`
      : `
Add these to your production environment (never commit them).
Copy the WHOLE of each value — the 6-digit code further down is not one of
these, it's only there to check your authenticator agrees:

  STORE_SWITCH_PATH=${path}
  STORE_SWITCH_TOTP_SECRET=${secret}

Your URL then is:`,
  );

  console.log(`

  ${env.APP_URL}/api/ops/${path}?action=close&code=<6 digits>

  ...and ?action=open to reopen, ?action=status to check.
  Add &reason=... on close to note why in the audit log.

  (That host comes from APP_URL. Set it to your public https:// address in
  production — locally it is http, and a browser that "helpfully" upgrades
  the URL to https gets ERR_SSL_PROTOCOL_ERROR from a server with no TLS.)

Save it as a bookmark or a phone shortcut. The path alone does nothing
without a current code, and a code is single-use, so a stale link in a log
or in browser history is not a working kill switch.

Add it by hand:  ${uri}

Your authenticator should be showing ${current} right now. That is a check,
not a setting — it changes every 30 seconds and belongs in no file.
`);

  printQr(qr);
}

main();
