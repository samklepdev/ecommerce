import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * RFC 6238 TOTP verification — the 6-digit code from an authenticator app.
 *
 * Written out rather than pulled in as a dependency: it's HMAC-SHA1 over a
 * counter, node's crypto does the only hard part, and a package here would
 * be a supply-chain risk sitting directly on the kill switch.
 *
 * SHA-1 is correct here and not a weakness — TOTP's security rests on the
 * shared secret and the 30-second window, not on collision resistance, and
 * every authenticator app implements SHA-1 by default.
 */

const STEP_SECONDS = 30;
const DIGITS = 6;
/** How many steps either side of now to accept, for clock drift between
 * your phone and the server. One step each way = a ±30s tolerance, the
 * conventional choice; more than that widens the replay window for nothing. */
const DRIFT_STEPS = 1;

/** Base32 (RFC 4648, no padding) — the encoding every authenticator app
 * uses for the shared secret. */
export function decodeBase32(input: string): Buffer | null {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleaned = input.replace(/=+$/, '').replace(/\s/g, '').toUpperCase();
  if (cleaned.length === 0) return null;

  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of cleaned) {
    const index = alphabet.indexOf(char);
    if (index === -1) return null;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** The code for a given 30-second step. Exported for tests and for the
 * setup script's "here's the current code" confirmation. */
export function generateTotp(secret: Buffer, step: number): string {
  const counter = Buffer.alloc(8);
  // Steps stay well inside 32 bits for the next ~4000 years, so the high
  // word is zero — written explicitly rather than relying on that.
  counter.writeUInt32BE(Math.floor(step / 0x1_0000_0000), 0);
  counter.writeUInt32BE(step >>> 0, 4);

  const digest = createHmac('sha1', secret).update(counter).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);

  return (binary % 10 ** DIGITS).toString().padStart(DIGITS, '0');
}

export interface TotpVerification {
  valid: boolean;
  /** Which step matched — the caller uses it to make a code single-use, so
   * one seen in a log can't be replayed inside its own window. */
  step: number | null;
}

/**
 * Constant-time check of `code` against every step within the drift window.
 *
 * Every candidate is compared even after a match, so the time taken doesn't
 * reveal which step hit — the same reason the comparison itself is
 * constant-time.
 */
export function verifyTotp(
  secret: Buffer,
  code: string,
  now: Date = new Date(),
): TotpVerification {
  if (!/^\d{6}$/.test(code)) return { valid: false, step: null };

  const currentStep = Math.floor(now.getTime() / 1000 / STEP_SECONDS);
  const provided = Buffer.from(code);

  let matchedStep: number | null = null;
  for (let offset = -DRIFT_STEPS; offset <= DRIFT_STEPS; offset += 1) {
    const step = currentStep + offset;
    const expected = Buffer.from(generateTotp(secret, step));
    if (expected.length === provided.length && timingSafeEqual(expected, provided)) {
      matchedStep = step;
    }
  }

  return { valid: matchedStep !== null, step: matchedStep };
}

/** The `otpauth://` URI an authenticator app scans or imports. */
export function totpUri(secretBase32: string, label: string, issuer: string): string {
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}?${params}`;
}

export const TOTP_STEP_SECONDS = STEP_SECONDS;
