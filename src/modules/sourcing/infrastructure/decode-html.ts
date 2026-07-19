import * as cheerio from 'cheerio';

/** Decodes HTML entities and strips tags — feeds commonly return `name` entity-encoded
 * and `description` as raw HTML; neither should be stored/displayed verbatim.
 * Inserts a space at block boundaries first so stripped paragraphs don't run
 * together word-to-word. */
export function decodeHtml(input: string): string {
  const withBreaks = input.replace(/<\/(p|div|li|h[1-6])>|<br\s*\/?>/gi, '$& ');
  return cheerio.load(withBreaks).root().text().replace(/\s+/g, ' ').trim();
}
