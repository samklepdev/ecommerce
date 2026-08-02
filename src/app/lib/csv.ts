/**
 * CSV escaping for the admin exports.
 *
 * Extracted because five export routes each carried their own copy, and the
 * sixth would have been the orders export — which is the first one to carry
 * customer-controlled text.
 *
 * Two separate jobs, and only the first was being done:
 *
 * 1. **Quoting**, so a comma, quote or newline in a value can't shift every
 *    subsequent column into the wrong field.
 * 2. **Formula neutralisation.** Excel, Sheets and LibreOffice treat a cell
 *    beginning `=`, `+`, `-`, `@`, or a tab/CR as a formula. Order exports
 *    contain values a customer typed — their email, their name, their address
 *    — so a customer calling themselves `=HYPERLINK("http://evil","Invoice")`
 *    gets that executed on the admin's machine when they open the file. That
 *    is a real path from a public signup form to code running in the shop
 *    owner's spreadsheet.
 *
 * The neutralising prefix is a single quote, which spreadsheets strip on
 * display and treat as "this is text" — so the value still reads correctly to
 * a human, unlike stripping the character outright.
 */
const NEEDS_QUOTING = /[",\n\r]/;
const FORMULA_LEAD = /^[=+\-@\t\r]/;

export function csvCell(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const neutralised = FORMULA_LEAD.test(raw) ? `'${raw}` : raw;
  return NEEDS_QUOTING.test(neutralised)
    ? `"${neutralised.replace(/"/g, '""')}"`
    : neutralised;
}

/** A whole CSV document from a header and rows, newline-terminated so the
 * last line isn't ragged when appended to. */
export function toCsv(header: readonly string[], rows: readonly unknown[][]): string {
  return [header.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\n');
}
