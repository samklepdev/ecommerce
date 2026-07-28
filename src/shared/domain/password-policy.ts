/**
 * The one definition of an acceptable password.
 *
 * Shared so signup, reset and change-password can't drift apart — before
 * this they each carried their own `min(8)`, which is the sort of thing that
 * gets tightened in one place and forgotten in the other two.
 *
 * The shape of the rule follows current NIST guidance rather than the
 * classic "one upper, one lower, one digit, one symbol": length is what
 * actually resists guessing, and forcing character classes on top of a long
 * passphrase mostly produces `Password1!`. So the classes are required only
 * up to `PASSPHRASE_LENGTH`, past which length alone carries it.
 */

export const MIN_PASSWORD_LENGTH = 12;

/** Past this, character-class rules are waived — see above. */
export const PASSPHRASE_LENGTH = 24;

/** Guards against a long password made of one repeated character, which is
 * long but not remotely unguessable. */
const MIN_DISTINCT_CHARACTERS = 5;

export const PASSWORD_RULE_TEXT =
  `At least ${MIN_PASSWORD_LENGTH} characters, including a number and a symbol. ` +
  `A passphrase of ${PASSPHRASE_LENGTH} or more characters needs neither.`;

/**
 * Returns a message describing the first unmet rule, or null when the
 * password is acceptable.
 *
 * A message rather than a boolean because "invalid password" tells someone
 * nothing about how to fix it, and this is the error people hit most.
 */
export function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  if (new Set(password).size < MIN_DISTINCT_CHARACTERS) {
    return `Use at least ${MIN_DISTINCT_CHARACTERS} different characters.`;
  }

  // Long enough that the classes stop earning their inconvenience.
  if (password.length >= PASSPHRASE_LENGTH) return null;

  if (!/[0-9]/.test(password)) {
    return 'Include at least one number, or use a longer passphrase.';
  }

  // Anything that isn't a letter or a digit, space included — a space is a
  // perfectly good symbol and passphrases are full of them.
  if (!/[^A-Za-z0-9]/.test(password)) {
    return 'Include at least one symbol, or use a longer passphrase.';
  }

  return null;
}
