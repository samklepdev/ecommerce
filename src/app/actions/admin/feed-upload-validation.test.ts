import { describe, expect, it } from 'vitest';

import {
  isAllowedJsonFeedUpload,
  isAllowedSpreadsheetUpload,
} from './feed-upload-validation';

describe('feed upload validation', () => {
  it.each([
    ['products.json', 'application/json'],
    ['products.js', 'text/javascript'],
    ['products.ts', 'video/mp2t'],
  ])('allows supported JSON feed file %s', (name, type) => {
    expect(isAllowedJsonFeedUpload({ name, type })).toBe(true);
  });

  it.each([
    ['products.csv', 'text/csv'],
    ['products.csv', 'text/plain'],
    ['products.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ])('allows supported spreadsheet %s', (name, type) => {
    expect(isAllowedSpreadsheetUpload({ name, type })).toBe(true);
  });

  it('rejects a renamed executable', () => {
    expect(isAllowedSpreadsheetUpload({ name: 'products.csv', type: 'application/x-msdownload' })).toBe(
      false,
    );
  });

  it('rejects a valid MIME type paired with the wrong extension', () => {
    expect(isAllowedSpreadsheetUpload({ name: 'products.pdf', type: 'text/csv' })).toBe(false);
  });

  it('matches extensions and MIME types case-insensitively', () => {
    expect(isAllowedJsonFeedUpload({ name: 'PRODUCTS.JSON', type: 'APPLICATION/JSON' })).toBe(true);
  });
});
