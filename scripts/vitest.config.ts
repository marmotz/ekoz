import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'scripts',
    environment: 'node',
    include: ['scripts/**/*.test.ts'],
    root: new URL('..', import.meta.url).pathname,
  },
});
