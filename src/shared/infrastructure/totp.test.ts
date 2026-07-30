import { describe, expect, it } from 'vitest';

import { decodeBase32, generateTotp, totpUri, verifyTotp } from './totp';

/** RFC 6238 appendix B publishes expected codes for the ASCII secret
 * "12345678901234567890" at fixed timestamps. Testing against the spec's own
 * vectors is the only way to know this implementation is the real algorithm
 * and not merely self-consistent. */
const RFC_SECRET = Buffer.from('12345678901234567890', 'ascii');

describe('generateTotp (RFC 6238 test vectors)', () => {
  const vectors: [number, string][] = [
    [59, '287082'],
    [1_111_111_109, '081804'],
    [1_111_111_111, '050471'],
    [1_234_567_890, '005924'],
    [2_000_000_000, '279037'],
  ];

  for (const [unixTime, expected] of vectors) {
    it(`matches the published code at t=${unixTime}`, () => {
      expect(generateTotp(RFC_SECRET, Math.floor(unixTime / 30))).toBe(expected);
    });
  }
});

describe('decodeBase32', () => {
  it('decodes an authenticator-style secret', () => {
    // "Hello!" in base32 per RFC 4648.
    expect(decodeBase32('JBSWY3DPEE======')?.toString('ascii')).toBe('Hello!');
  });

  it('ignores padding, whitespace and case, as authenticator apps do', () => {
    expect(decodeBase32('jbswy3dp ee')?.toString('ascii')).toBe('Hello!');
  });

  it('rejects characters outside the alphabet rather than silently skipping them', () => {
    expect(decodeBase32('JBSW0189')).toBeNull();
    expect(decodeBase32('')).toBeNull();
  });
});

describe('verifyTotp', () => {
  const at = (unixSeconds: number) => new Date(unixSeconds * 1000);

  it('accepts the current code', () => {
    const now = at(1_111_111_109);
    const code = generateTotp(RFC_SECRET, Math.floor(1_111_111_109 / 30));

    expect(verifyTotp(RFC_SECRET, code, now)).toEqual({
      valid: true,
      step: Math.floor(1_111_111_109 / 30),
    });
  });

  // Phone and server clocks are never exactly aligned; one step either way is
  // the conventional tolerance.
  it('accepts the previous and next code for clock drift', () => {
    const nowStep = Math.floor(1_111_111_109 / 30);

    for (const offset of [-1, 1]) {
      const code = generateTotp(RFC_SECRET, nowStep + offset);
      const result = verifyTotp(RFC_SECRET, code, at(1_111_111_109));

      expect(result.valid).toBe(true);
      expect(result.step).toBe(nowStep + offset);
    }
  });

  it('rejects a code two steps out — the window is deliberately narrow', () => {
    const nowStep = Math.floor(1_111_111_109 / 30);
    const code = generateTotp(RFC_SECRET, nowStep + 2);

    expect(verifyTotp(RFC_SECRET, code, at(1_111_111_109)).valid).toBe(false);
  });

  it('rejects a wrong code, and anything that is not six digits', () => {
    const now = at(1_111_111_109);

    expect(verifyTotp(RFC_SECRET, '000000', now).valid).toBe(false);
    expect(verifyTotp(RFC_SECRET, '12345', now).valid).toBe(false);
    expect(verifyTotp(RFC_SECRET, '1234567', now).valid).toBe(false);
    expect(verifyTotp(RFC_SECRET, 'abcdef', now).valid).toBe(false);
    expect(verifyTotp(RFC_SECRET, '', now).valid).toBe(false);
  });

  it('reports the matched step so the caller can make a code single-use', () => {
    const step = Math.floor(1_111_111_109 / 30);
    const result = verifyTotp(RFC_SECRET, generateTotp(RFC_SECRET, step), at(1_111_111_109));

    expect(result.step).toBe(step);
  });
});

describe('totpUri', () => {
  it('builds a URI an authenticator app can import', () => {
    const uri = totpUri('JBSWY3DPEE', 'kill switch', 'Storefront');

    expect(uri).toContain('otpauth://totp/Storefront:kill%20switch');
    expect(uri).toContain('secret=JBSWY3DPEE');
    expect(uri).toContain('issuer=Storefront');
  });

  // Every omitted parameter is one this file implements at the spec default,
  // and ~34 characters that would push the QR up a version — see totpUri.
  it('omits the parameters that are already the defaults, to keep the QR small', () => {
    const uri = totpUri('JBSWY3DPEE', 'kill switch', 'Storefront');

    expect(uri).not.toContain('algorithm=');
    expect(uri).not.toContain('digits=');
    expect(uri).not.toContain('period=');
    expect(uri.length).toBeLessThan(80);
  });
});
