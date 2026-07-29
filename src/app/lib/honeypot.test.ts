import { describe, expect, it } from 'vitest';

import { HONEYPOT_FIELD, isHoneypotTripped } from './honeypot';

function formWith(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

describe('isHoneypotTripped', () => {
  it('is not tripped by a form a person filled in', () => {
    expect(isHoneypotTripped(formWith({ subject: 'Hello', [HONEYPOT_FIELD]: '' }))).toBe(false);
  });

  it('is not tripped when the field is absent entirely', () => {
    expect(isHoneypotTripped(formWith({ subject: 'Hello' }))).toBe(false);
  });

  it('is tripped when something filled the trap', () => {
    expect(isHoneypotTripped(formWith({ [HONEYPOT_FIELD]: 'http://spam.example' }))).toBe(true);
  });

  // Trimmed on purpose: a stray space from an autofill or a fat finger
  // must never silently discard a real customer's message.
  it('ignores whitespace-only values', () => {
    expect(isHoneypotTripped(formWith({ [HONEYPOT_FIELD]: '   ' }))).toBe(false);
  });
});
