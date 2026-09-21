import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    name: 'client-web',
    environment: 'jsdom',
    environmentOptions: {
      jsdom: { url: 'http://localhost:3000' },
    },
    globals: true,
    setupFiles: ['test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.{ts,tsx}'],
    env: {
      VITE_EKOZ_SERVER: 'http://localhost:3010',
    },
  },
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
      // The generated form hooks import their runtime and schemas as `api/react-tanstack/...`.
      api: new URL('./src/generated/api', import.meta.url).pathname,
    },
  },
});
