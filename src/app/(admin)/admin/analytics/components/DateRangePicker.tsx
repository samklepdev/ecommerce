import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import styles from './DateRangePicker.module.css';

export interface DateRangePickerProps {
  since: Date;
  until: Date;
  /** The page path to GET back to with updated `from`/`to` params. */
  action: string;
}

function toDateInputValue(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Plain GET form, no client JS — matches the products page's
 * searchParams-driven filtering. Submitting re-renders the page (a
 * Server Component) with new `from`/`to` query params. */
export function DateRangePicker({ since, until, action }: DateRangePickerProps) {
  return (
    <form action={action} method="get" className={styles.form}>
      <Field label="From" htmlFor="analytics-date-from">
        <Input type="date" id="analytics-date-from" name="from" defaultValue={toDateInputValue(since)} />
      </Field>
      <Field label="To" htmlFor="analytics-date-to">
        <Input type="date" id="analytics-date-to" name="to" defaultValue={toDateInputValue(until)} />
      </Field>
      <Button type="submit" variant="secondary" className={styles.submit}>
        Apply
      </Button>
    </form>
  );
}
