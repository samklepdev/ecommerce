/**
 * Minimal RFC 4180 CSV parser: quoted fields, escaped `""` quotes, commas
 * and newlines inside quotes, and CRLF/LF line endings. Returns each data
 * row as a plain object keyed by the (trimmed) header row; blank rows are
 * skipped. No external dependency — the grammar is small enough to not be
 * worth one.
 */
function delimiterFor(text: string): ',' | ';' | '\t' {
  const firstRecord = text.split(/\r?\n/, 1)[0] ?? '';
  const counts = ([',', ';', '\t'] as const).map((delimiter) => ({
    delimiter,
    count: firstRecord.split(delimiter).length - 1,
  }));
  return counts.sort((a, b) => b.count - a.count)[0]?.delimiter ?? ',';
}

export function parseCsv(text: string): Record<string, string>[] {
  const delimiter = delimiterFor(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\r') {
      // normalized away; \n (below) closes the row
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const [header, ...dataRows] = rows;
  if (!header) return [];
  const keys = header.map((h, index) => (index === 0 ? h.replace(/^\uFEFF/, '') : h).trim());

  return dataRows
    .filter((r) => r.some((cell) => cell.trim() !== ''))
    .map((r) => {
      const obj: Record<string, string> = {};
      keys.forEach((key, idx) => {
        if (key) obj[key] = (r[idx] ?? '').trim();
      });
      return obj;
    });
}
