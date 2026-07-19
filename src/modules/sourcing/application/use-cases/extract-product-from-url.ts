import type { UseCase } from '@/shared/application/use-case';
import { isErr } from '@/shared/domain/result';
import { logger } from '@/shared/infrastructure/logger';
import type { UrlContentExtractor } from '@/modules/sourcing/application/ports/url-content-extractor';

export interface ExtractProductFromUrlInput {
  url: string;
}

export type ExtractProductFromUrlResult =
  | {
      status: 'ok';
      text: string;
      guessedName: string | null;
      guessedDescription: string | null;
      guessedImageUrl: string | null;
      guessedPriceMinor: number | null;
      guessedCurrency: string | null;
    }
  | { status: 'blocked' | 'error'; message: string };

/** Thin wrapper around `UrlContentExtractor` for the "paste a link" admin
 * tool — fetches one URL, strips it to text, and returns best-effort
 * guesses for the Add Product form to prefill. Never creates anything. */
export class ExtractProductFromUrl
  implements UseCase<ExtractProductFromUrlInput, ExtractProductFromUrlResult>
{
  constructor(private readonly extractor: UrlContentExtractor) {}

  async execute(input: ExtractProductFromUrlInput): Promise<ExtractProductFromUrlResult> {
    const result = await this.extractor.extract(input.url);

    if (isErr(result)) {
      const { error } = result;
      let status: 'blocked' | 'error';
      let message: string;
      switch (error.code) {
        case 'robots_disallowed':
          status = 'blocked';
          message = 'Disallowed by robots.txt';
          break;
        case 'blocked':
          status = 'blocked';
          message = `Blocked (HTTP ${error.httpStatus})`;
          break;
        case 'network_error':
          status = 'error';
          message = error.message;
          break;
      }
      logger.warn('extract product from url failed', { url: input.url, code: error.code, message });
      return { status, message };
    }

    const { text, guessedName, guessedDescription, guessedImageUrl, guessedPriceMinor, guessedCurrency } =
      result.value;
    return {
      status: 'ok',
      text,
      guessedName,
      guessedDescription,
      guessedImageUrl,
      guessedPriceMinor,
      guessedCurrency,
    };
  }
}
