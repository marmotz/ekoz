import { defineConfig } from 'vitest/config';

// Root Vitest config. `projects` discovers each workspace's own vitest.config.ts.
// apps/server is intentionally excluded: its config declares its own `test.projects`
// (unit / integration) and boots Testcontainers, so it runs on its own via
// `bun run --filter '@ekozhq/server' test` (see root script `test:server`).
export default defineConfig({
  test: {
    projects: [
      'packages/*/vitest.config.ts',
      'apps/client-web/vitest.config.ts',
      'apps/admin/vitest.config.ts',
      'apps/docs/vitest.config.ts',
      'scripts/vitest.config.ts',
    ],
  },
});
