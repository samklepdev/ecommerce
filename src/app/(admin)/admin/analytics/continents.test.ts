import { describe, expect, it } from 'vitest';

import type { CountryViews } from '@/modules/analytics/application/ports/analytics-event-repository';
import { busiestContinent, summarizeByContinent } from './continents';

function row(
  country: string,
  continent: string,
  views: number,
  sampleIp: string | null = '1.2.3.4',
): CountryViews {
  return { country, continent, views, sampleIp };
}

describe('summarizeByContinent', () => {
  it('sums the countries within each continent', () => {
    const result = summarizeByContinent([
      row('United States', 'North America', 100),
      row('Canada', 'North America', 40),
      row('Germany', 'Europe', 30),
    ]);

    const na = result.find((r) => r.continent === 'North America');
    expect(na?.views).toBe(140);
    expect(result.find((r) => r.continent === 'Europe')?.views).toBe(30);
  });

  it('takes the first country seen as the continent leader', () => {
    // Rows arrive busiest-first from the repository.
    const result = summarizeByContinent([
      row('United States', 'North America', 100, '8.8.8.8'),
      row('Canada', 'North America', 40, '1.1.1.1'),
    ]);

    const na = result.find((r) => r.continent === 'North America');
    expect(na?.topCountry).toBe('United States');
    expect(na?.topCountryIp).toBe('8.8.8.8');
  });

  it('returns every drawable continent even with no traffic', () => {
    // The map draws all of them; a missing entry would be a landmass with
    // no tooltip rather than an explicit zero.
    const result = summarizeByContinent([]);

    expect(result).toHaveLength(6);
    expect(result.every((r) => r.views === 0 && r.topCountry === null)).toBe(true);
  });

  it('ignores a continent the map does not draw', () => {
    const result = summarizeByContinent([row('Antarctica', 'Antarctica', 5)]);

    expect(result.reduce((t, r) => t + r.views, 0)).toBe(0);
  });

  it('keeps a null sample IP as null rather than inventing one', () => {
    const result = summarizeByContinent([row('Japan', 'Asia', 3, null)]);

    expect(result.find((r) => r.continent === 'Asia')?.topCountryIp).toBeNull();
  });
});

describe('busiestContinent', () => {
  it('picks the continent with the most views', () => {
    const summaries = summarizeByContinent([
      row('Germany', 'Europe', 90),
      row('United States', 'North America', 120),
    ]);

    expect(busiestContinent(summaries)).toBe('North America');
  });

  it('returns null when nothing has resolved yet', () => {
    expect(busiestContinent(summarizeByContinent([]))).toBeNull();
  });

  it('breaks ties stably rather than arbitrarily per render', () => {
    const summaries = summarizeByContinent([
      row('United States', 'North America', 50),
      row('Germany', 'Europe', 50),
    ]);

    expect(busiestContinent(summaries)).toBe('North America');
    expect(busiestContinent(summaries)).toBe('North America');
  });
});
