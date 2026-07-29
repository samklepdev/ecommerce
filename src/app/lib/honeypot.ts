/**
 * A field no person fills in.
 *
 * Bots that scrape a form and post every input they find will fill this;
 * a human never sees it. Cheap, silent, and it asks nothing of the visitor
 * — unlike a CAPTCHA, which taxes every real customer to stop the few.
 *
 * It is not a security control. It stops naive spam, and nothing else: a
 * bot written against this specific form will skip it. Rate limits remain
 * the actual defence.
 */
export const HONEYPOT_FIELD = 'contact_time';

/** True when the trap was filled — meaning: discard this submission. */
export function isHoneypotTripped(formData: FormData): boolean {
  const value = formData.get(HONEYPOT_FIELD);
  return typeof value === 'string' && value.trim().length > 0;
}
