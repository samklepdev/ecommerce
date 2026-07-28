import { describe, expect, it } from 'vitest';

import { MIN_PASSWORD_LENGTH, PASSWORD_RULE_TEXT, validatePassword } from './password-policy';

describe('validatePassword', () => {
  it('accepts a password meeting every rule', () => {
    expect(validatePassword('correct-horse-9!')).toBeNull();
  });

  it('rejects one that is too short, even if otherwise varied', () => {
    expect(validatePassword('Aa1!bc')).toMatch(/12 characters/);
  });

  it('names the missing character class rather than just failing', () => {
    expect(validatePassword('alllowercaseletters')).toMatch(/number/i);
    expect(validatePassword('lowercase1234567890')).toMatch(/symbol/i);
  });

  it('counts a space as a symbol, so passphrases pass', () => {
    expect(validatePassword('correct horse battery staple 9')).toBeNull();
  });

  it('rejects an empty password with the length message', () => {
    expect(validatePassword('')).toMatch(/12 characters/);
  });

  // Length is the rule that actually buys security; the classes mostly stop
  // "aaaaaaaaaaaa". A long passphrase shouldn't be blocked for lacking a
  // digit when it's already well past the length that matters.
  it('waives the character classes for a long passphrase', () => {
    expect(validatePassword('the quick brown fox jumps over the lazy dog')).toBeNull();
  });

  it('still rejects a long string of one repeated character', () => {
    expect(validatePassword('a'.repeat(60))).toMatch(/different/i);
  });

  it('publishes the rule as text the UI can show up front', () => {
    expect(PASSWORD_RULE_TEXT).toContain(String(MIN_PASSWORD_LENGTH));
  });
});
