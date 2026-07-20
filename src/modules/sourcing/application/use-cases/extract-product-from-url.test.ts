import { describe, expect, it } from 'vitest';

import { ExtractProductFromUrl } from './extract-product-from-url';
import { err, ok } from '@/shared/domain/result';
import type {
  ExtractedUrlContent,
  ExtractUrlContentError,
  UrlContentExtractor,
} from '@/modules/sourcing/application/ports/url-content-extractor';

function makeFakeExtractor(result: Awaited<ReturnType<UrlContentExtractor['extract']>>) {
  const extractor: UrlContentExtractor = {
    async extract() {
      return result;
    },
  };
  return extractor;
}

function makeContent(overrides: Partial<ExtractedUrlContent> = {}): ExtractedUrlContent {
  return {
    url: 'https://supplier.example.com/item',
    text: 'Some product text',
    guessedName: 'Widget',
    guessedDescription: 'A widget',
    guessedImageUrl: 'https://supplier.example.com/img.png',
    guessedPriceMinor: 999,
    guessedCurrency: 'USD',
    ...overrides,
  };
}

describe('ExtractProductFromUrl', () => {
  it('returns the extracted content on success', async () => {
    const extractor = makeFakeExtractor(ok(makeContent()));

    const result = await new ExtractProductFromUrl(extractor).execute({ url: 'https://supplier.example.com/item' });

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.guessedName).toBe('Widget');
      expect(result.guessedPriceMinor).toBe(999);
    }
  });

  it.each([
    [{ code: 'robots_disallowed' } as ExtractUrlContentError, 'blocked', 'Disallowed by robots.txt'],
    [{ code: 'blocked', httpStatus: 451 } as ExtractUrlContentError, 'blocked', 'Blocked (HTTP 451)'],
    [{ code: 'network_error', message: 'DNS failure' } as ExtractUrlContentError, 'error', 'DNS failure'],
  ])('maps error %o to status/message', async (error, expectedStatus, expectedMessage) => {
    const extractor = makeFakeExtractor(err(error));

    const result = await new ExtractProductFromUrl(extractor).execute({ url: 'https://supplier.example.com/item' });

    expect(result.status).toBe(expectedStatus);
    if (result.status !== 'ok') expect(result.message).toBe(expectedMessage);
  });
});
