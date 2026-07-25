import { Workbook } from 'exceljs';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import { isErr } from '@/shared/domain/result';
import { JsonProductFeedFetcher } from './json-product-feed-fetcher';

describe('JsonProductFeedFetcher spreadsheet parsing', () => {
  const fetcher = new JsonProductFeedFetcher();

  it.each([
    ['comma-delimited CSV', '\uFEFFName,Price,Product URL\r\nWidget,19.99,https://example.com/widget\r\n'],
    ['semicolon-delimited CSV', 'Name;Price;Product URL\r\nWidget;19.99;https://example.com/widget\r\n'],
    ['tab-delimited CSV', 'Name\tPrice\tProduct URL\r\nWidget\t19.99\thttps://example.com/widget\r\n'],
  ])('parses %s', async (_name, csv) => {
    const result = await fetcher.parseSpreadsheet(Buffer.from(csv));

    expect(isErr(result)).toBe(false);
    if (!isErr(result)) {
      expect(result.value[0]).toMatchObject({
        name: 'Widget',
        slug: 'widget',
        priceMinor: 1999,
        productUrl: 'https://example.com/widget',
      });
    }
  });

  it('normalizes camelCase headers from Google Sheets exports', async () => {
    const csv = [
      'name,description,price,source,category,slug,productUrl',
      'Test 1,Test 1,45,Test 1,Test 1,test-1,https://www.product1.com',
    ].join('\r\n');

    const result = await fetcher.parseSpreadsheet(Buffer.from(csv));

    expect(isErr(result)).toBe(false);
    if (!isErr(result)) {
      expect(result.value[0]).toMatchObject({
        name: 'Test 1',
        slug: 'test-1',
        priceMinor: 4500,
        productUrl: 'https://www.product1.com',
      });
    }
  });

  it.skipIf(!process.env.TEST_SPREADSHEET_PATH)(
    'parses a spreadsheet supplied for manual diagnosis',
    async () => {
      const bytes = await readFile(process.env.TEST_SPREADSHEET_PATH!);
      const result = await fetcher.parseSpreadsheet(bytes);
      expect(result).toMatchObject({ ok: true });
    },
  );

  it('parses an XLSX workbook', async () => {
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet('Products');
    sheet.addRow(['Title', 'Price', 'Link', 'Stock']);
    sheet.addRow(['Workbook Widget', 25.5, 'https://example.com/workbook-widget', 3]);
    const bytes = await workbook.xlsx.writeBuffer();

    const result = await fetcher.parseSpreadsheet(Buffer.from(bytes));

    expect(isErr(result)).toBe(false);
    if (!isErr(result)) {
      expect(result.value[0]).toMatchObject({
        name: 'Workbook Widget',
        priceMinor: 2550,
        productUrl: 'https://example.com/workbook-widget',
        available: true,
      });
    }
  });

  it('imports a catalog spreadsheet without product URLs', async () => {
    const result = await fetcher.parseSpreadsheet(Buffer.from('Name,Price\nWidget,19.99\n'));

    expect(isErr(result)).toBe(false);
    if (!isErr(result)) {
      expect(result.value[0]).toMatchObject({
        productUrl: 'urn:spreadsheet-product:widget',
      });
    }
  });
});
