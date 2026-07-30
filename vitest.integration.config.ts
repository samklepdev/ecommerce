import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * The suite that talks to real Postgres and real Redis.
 *
 * Kept in its own config, and matched by its own filename suffix, so
 * `npm test` stays exactly what it was: domain and use-case tests that run
 * with no infrastructure at all. That separation is a rule in CLAUDE.md, and
 * it's what lets the fast suite stay runnable on a plane.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.integration.test.ts'],
    globalSetup: ['./tests/integration/global-setup.ts'],
    // These share one database. Running files in parallel would have them
    // truncating tables underneath each other, and the resulting flake would
    // cost more than the wall-clock time saved.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
});
