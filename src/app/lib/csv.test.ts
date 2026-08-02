import { describe, expect, it } from 'vitest';

import { csvCell, toCsv } from './csv';

describe('csvCell', () => {
  it('leaves an ordinary value alone', () => {
    expect(csvCell('hello')).toBe('hello');
    expect(csvCell(42)).toBe('42');
  });

  it('renders null and undefined as empty, not as the words', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });

  describe('quoting', () => {
    it('quotes a value containing a comma', () => {
      expect(csvCell('Smith, Ada')).toBe('"Smith, Ada"');
    });

    it('quotes and doubles an embedded quote', () => {
      expect(csvCell('the "good" one')).toBe('"the ""good"" one"');
    });

    it('quotes newlines, which would otherwise start a new record', () => {
      expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
      expect(csvCell('line1\r\nline2')).toBe('"line1\r\nline2"');
    });
  });

  describe('formula neutralisation', () => {
    /**
     * Excel, Sheets and LibreOffice execute a cell that begins with one of
     * these. The orders export carries values a customer typed — their email,
     * their name, their shipping address — so without this, a customer naming
     * themselves `=HYPERLINK(...)` gets it executed on the admin's machine
     * when they open the file. That is a path from a public signup form to
     * code running in the shop owner's spreadsheet.
     */
    it.each(['=', '+', '-', '@'])('neutralises a value starting with %s', (lead) => {
      expect(csvCell(`${lead}HYPERLINK("http://evil","Invoice")`)).toBe(
        `"'${lead}HYPERLINK(""http://evil"",""Invoice"")"`,
      );
    });

    it('neutralises the whitespace leads spreadsheets also honour', () => {
      // Prefixed but not quoted: a tab is not a CSV delimiter, so quoting it
      // would add noise without adding safety.
      expect(csvCell('\t=1+1')).toBe("'\t=1+1");
    });

    it('keeps the value readable rather than deleting the character', () => {
      // A leading apostrophe is stripped on display and means "this is text",
      // so a human still reads the original — unlike dropping the character,
      // which would silently corrupt a legitimate value.
      expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    });

    it('does not touch a minus sign inside a value', () => {
      expect(csvCell('order-1234')).toBe('order-1234');
    });

    it('does not touch a negative number written mid-field', () => {
      expect(csvCell('total was -5')).toBe('total was -5');
    });
  });
});

describe('toCsv', () => {
  it('joins a header and rows', () => {
    expect(toCsv(['a', 'b'], [[1, 2], [3, 4]])).toBe('a,b\n1,2\n3,4');
  });

  it('escapes header cells too', () => {
    // A header is as capable of carrying a comma as any other cell.
    expect(toCsv(['a,b'], [])).toBe('"a,b"');
  });

  it('handles no rows', () => {
    expect(toCsv(['a', 'b'], [])).toBe('a,b');
  });
});
