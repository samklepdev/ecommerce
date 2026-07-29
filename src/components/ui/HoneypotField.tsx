import { HONEYPOT_FIELD } from '@/app/lib/honeypot';

/**
 * Hidden from people, visible to a scraper.
 *
 * Deliberately not `type="hidden"` — a bot that fills only visible inputs
 * would skip that. It's a real text input taken out of the layout and out
 * of the accessibility tree, with autocomplete off so a browser never
 * helpfully fills it for a real customer.
 */
export function HoneypotField() {
  return (
    <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', top: 'auto', width: 1, height: 1, overflow: 'hidden' }}>
      <label htmlFor={HONEYPOT_FIELD}>Leave this field empty</label>
      <input
        type="text"
        id={HONEYPOT_FIELD}
        name={HONEYPOT_FIELD}
        tabIndex={-1}
        autoComplete="off"
        defaultValue=""
      />
    </div>
  );
}
