import styles from './PathFilter.module.css';

export interface PathFilterProps {
  /** Current filter value, echoed back into the field. */
  value?: string;
  /** Range params are re-submitted as hidden fields so filtering doesn't
   * silently reset the window you're looking at. */
  since: Date;
  until: Date;
  action: string;
}

function toDateParam(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Plain GET form, no client JS — submitting re-renders the server component
 * with a new `path` param, the same way the range presets work.
 *
 * A substring match rather than a dropdown of known paths: a catalog has
 * more paths than a select can hold, and "/products" as a prefix is the
 * question people actually ask. */
export function PathFilter({ value, since, until, action }: PathFilterProps) {
  return (
    <form className={styles.form} action={action} method="get">
      <input type="hidden" name="from" value={toDateParam(since)} />
      <input type="hidden" name="to" value={toDateParam(until)} />

      <label className={styles.label} htmlFor="path-filter">
        Filter by page
      </label>
      <div className={styles.controls}>
        <input
          id="path-filter"
          type="text"
          name="path"
          defaultValue={value ?? ''}
          placeholder="/products"
          className={styles.input}
        />
        <button type="submit" className={styles.submit}>
          Filter
        </button>
        {value && (
          <a href={`${action}?from=${toDateParam(since)}&to=${toDateParam(until)}`} className={styles.clear}>
            Clear
          </a>
        )}
      </div>
    </form>
  );
}
