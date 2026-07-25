import { Workbook, type CellValue } from 'exceljs';

import { parseCsv } from '@/modules/sourcing/infrastructure/csv';

const XLSX_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // "PK\x03\x04" — xlsx is a zip archive

function isXlsx(buffer: Buffer): boolean {
  return XLSX_MAGIC.every((byte, i) => buffer[i] === byte);
}

function cellToString(value: CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if ('richText' in value) return value.richText.map((r) => r.text).join('');
    if ('text' in value) return String(value.text ?? '');
    if ('result' in value) return String(value.result ?? '');
    if ('hyperlink' in value) return String(value.hyperlink ?? '');
    return '';
  }
  return String(value);
}

async function parseXlsxRows(buffer: Buffer): Promise<Record<string, string>[]> {
  const workbook = new Workbook();
  // exceljs's own .d.ts declares a local, broken `Buffer` (`extends
  // ArrayBuffer` only) that shadows the real Node `Buffer` just for that
  // module's own type-checking — a known exceljs typings bug, not a real
  // runtime mismatch (a real Buffer is exactly what `.load()` wants), so
  // `unknown` alone can't bridge the two distinctly-typed `Buffer`s.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(buffer as any);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const headers: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber] = cellToString(cell.value).trim();
  });

  const rows: Record<string, string>[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj: Record<string, string> = {};
    let hasValue = false;
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const key = headers[colNumber];
      if (!key) return;
      const value = cellToString(cell.value).trim();
      obj[key] = value;
      if (value !== '') hasValue = true;
    });
    if (hasValue) rows.push(obj);
  });

  return rows;
}

/** Reads an uploaded `.csv` or `.xlsx` file into plain row objects keyed by
 * its header row. Format is sniffed from content (xlsx is a zip archive),
 * not the filename — legacy binary `.xls` isn't supported. */
export async function parseSpreadsheetRows(buffer: Buffer): Promise<Record<string, string>[]> {
  if (isXlsx(buffer)) return parseXlsxRows(buffer);
  // Excel may save a "Unicode Text" CSV as UTF-16LE. Decode that BOM here;
  // normal UTF-8 CSVs (with or without their own BOM) take the usual path.
  const text =
    buffer[0] === 0xff && buffer[1] === 0xfe
      ? new TextDecoder('utf-16le').decode(buffer.subarray(2))
      : buffer.toString('utf8');
  return parseCsv(text);
}
