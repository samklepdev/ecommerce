import robotsParser from 'robots-parser';
import { safeFetch } from '@/shared/infrastructure/safe-fetch';

// Honest, identifying UA — no browser impersonation. Adjust the contact URL
// to something real before this ever talks to a live third-party site.
export const USER_AGENT = 'MystoreCatalogSync/1.0 (+https://example.com/bot)';
const ROBOTS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface CachedRobots {
  robots: ReturnType<typeof robotsParser>;
  fetchedAt: number;
}

const robotsCache = new Map<string, CachedRobots>();

/**
 * Shared by every supplier-facing fetcher (single-page scraper, feed importer).
 * Absence/unreachability of robots.txt is treated as allowed (standard crawler
 * convention — a missing robots.txt is not a disallow signal).
 */
export async function isAllowedByRobots(url: string): Promise<boolean> {
  const { origin } = new URL(url);
  const cached = robotsCache.get(origin);
  if (cached && Date.now() - cached.fetchedAt < ROBOTS_CACHE_TTL_MS) {
    return cached.robots.isAllowed(url, USER_AGENT) ?? true;
  }

  const robotsUrl = `${origin}/robots.txt`;
  try {
    // Guarded too: this runs before the caller's own fetch, so without it
    // robots.txt would be the way in to `http://127.0.0.1:6379/robots.txt`.
    const res = await safeFetch(robotsUrl, { headers: { 'User-Agent': USER_AGENT } });
    const body = res.ok ? await res.text() : '';
    const robots = robotsParser(robotsUrl, body);
    robotsCache.set(origin, { robots, fetchedAt: Date.now() });
    return robots.isAllowed(url, USER_AGENT) ?? true;
  } catch {
    return true;
  }
}
