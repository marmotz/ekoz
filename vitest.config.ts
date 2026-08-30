import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC transforms the NestJS decorators + `emitDecoratorMetadata` that the Vitest
// (esbuild/oxc) pipeline does not emit on its own.
const swcPlugin = swc.vite({
  jsc: {
    target: 'es2022',
    parser: { syntax: 'typescript', decorators: true },
    transform: { legacyDecorator: true, decoratorMetadata: true },
  },
});

// Specs live next to the code they cover: `*.spec.ts` = unit, `*.e2e-spec.ts` =
// integration (boots a Nest app, may use Testcontainers).
export default defineConfig({
  plugins: [swcPlugin],
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['vitest.setup.ts'],
    projects: [
      {
        plugins: [swcPlugin],
        test: {
          name: 'unit',
          globals: true,
          environment: 'node',
          setupFiles: ['vitest.setup.ts'],
          include: ['src/**/*.spec.ts'],
          exclude: ['**/*.e2e-spec.ts', 'node_modules/**'],
        },
      },
      {
        plugins: [swcPlugin],
        test: {
          name: 'integration',
          globals: true,
          environment: 'node',
          setupFiles: ['vitest.setup.ts'],
          include: ['src/**/*.e2e-spec.ts'],
          // Testcontainers boot is slow; keep integration specs on one worker so
          // they share a single PostgreSQL container.
          fileParallelism: false,
          hookTimeout: 120_000,
          testTimeout: 30_000,
        },
      },
    ],
  },
});
