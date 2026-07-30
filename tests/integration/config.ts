/**
 * Where the integration suite's throwaway services live.
 *
 * Hardcoded defaults rather than reading `.env`, and on non-standard ports,
 * because these tests truncate every table between cases — pointing them at
 * a development database by accident should be impossible, not merely
 * unlikely. CI overrides both via environment.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://test:test@localhost:5433/storefront_test';

export const TEST_REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6380';

/** A last line of defence: refuse to run against anything that looks like a
 * real database, whatever the environment says. */
export function assertSafeTestTarget(url: string): void {
  const looksLikeTest = /storefront_test|_test(\b|$)|:5433|:6380/.test(url);
  if (!looksLikeTest) {
    throw new Error(
      `Refusing to run destructive integration tests against "${url}" — ` +
        'it does not look like the throwaway test target.',
    );
  }
}
