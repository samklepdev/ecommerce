import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import type { DateRange } from '../date-range';
import styles from './page.module.css';

export interface IdentityLookupFormProps {
  email?: string;
  session?: string;
  range: DateRange;
}

/** A plain GET form: the lookup belongs in the URL so a result can be
 * shared, bookmarked, and reloaded — the same reason the date range is a
 * query parameter here. Hidden fields carry the window through. */
export function IdentityLookupForm({ email, session, range }: IdentityLookupFormProps) {
  return (
    <form className={styles.lookup}>
      <input type="hidden" name="since" value={range.since.toISOString().slice(0, 10)} />
      <input type="hidden" name="until" value={range.until.toISOString().slice(0, 10)} />
      <Input
        type="email"
        name="email"
        defaultValue={email}
        placeholder="customer@example.com"
        aria-label="Account email"
      />
      <Input
        type="text"
        name="session"
        defaultValue={session}
        placeholder="or a session id"
        aria-label="Session id"
      />
      <Button type="submit" variant="secondary">
        Look up
      </Button>
    </form>
  );
}
