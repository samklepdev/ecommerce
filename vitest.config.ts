import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * The fast suite: domain and use cases, no database, no Redis, no network.
 *
 * Integration tests are excluded by suffix and live in
 * `vitest.integration.config.ts` — `npm test` must stay runnable with
 * nothing else started.
 */
export default defineConfig({
  test: {
    environment: 'node',
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/*.integration.test.ts'],
  },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
});
