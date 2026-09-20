import js from '@eslint/js';
import boundaries from 'eslint-plugin-boundaries';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

// ESLint here enforces the module-boundary rules Biome cannot express, plus the
// recommended and React rule sets the web-client-foundations ticket asks for.
// Formatting stays Biome's (see root biome.json). Run via
// `bun run --filter '@ekozhq/client-web' lint:boundaries`.
//
// Matrix (web-client-foundations/technical.md §5):
//   feature -> shared, its own feature
//   shared  -> shared
//   routes  -> shared, feature, app, server
//   app     -> shared, app, server
//   server  -> shared, app, server
//   root    -> everything (`src/router.tsx`, `src/router-context.ts`)
export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      '.output/**',
      'src/routeTree.gen.ts',
      'coverage/**',
      'test/**',
    ],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
  },
  {
    // File routes export `Route`, and shadcn/ui files export variants and helpers next
    // to their components, by design.
    files: ['src/routes/**', 'src/shared/ui/**'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { sourceType: 'module' },
    },
    plugins: { boundaries },
    settings: {
      // Resolves `@/*` aliases and extensionless `.ts` imports; without it the plugin
      // would classify aliased imports as external packages and never check them.
      'import/resolver': { typescript: { project: './tsconfig.json' } },
      'boundaries/include': ['src/**/*'],
      // Tests may import anything (fixtures, test helpers outside `src`); styles are assets.
      'boundaries/ignore': ['**/*.test.{ts,tsx}', 'src/styles/**'],
      'boundaries/elements': [
        { type: 'app', pattern: 'src/app' },
        { type: 'server', pattern: 'src/server' },
        { type: 'routes', pattern: 'src/routes' },
        { type: 'shared', pattern: 'src/shared' },
        // One element per feature folder: everything under `src/features/<feature>/`.
        { type: 'feature', pattern: 'src/features/*', capture: ['feature'] },
      ],
      // Files directly in `src/` (`router.tsx`, generated route tree) belong to no element.
      'boundaries/files': [{ category: 'root', pattern: 'src/*.{ts,tsx}' }],
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          policies: [
            { allow: { to: { module: { origin: 'external' } } } },
            { allow: { to: { module: { origin: 'core' } } } },
            {
              from: { element: { type: 'feature' } },
              allow: { to: { element: { type: 'shared' } } },
            },
            {
              from: { element: { type: 'feature' } },
              allow: { to: { element: { type: 'feature' } } },
            },
            {
              from: { element: { type: 'shared' } },
              allow: { to: { element: { type: 'shared' } } },
            },
            {
              from: { element: { type: 'routes' } },
              allow: { to: { element: { type: ['shared', 'feature', 'app', 'server'] } } },
            },
            {
              from: { element: { type: ['app', 'server'] } },
              allow: { to: { element: { type: ['shared', 'app', 'server'] } } },
            },
            {
              from: { file: { categories: 'root' } },
              allow: {
                to: { element: { type: ['app', 'server', 'routes', 'shared', 'feature'] } },
              },
            },
            {
              from: { file: { categories: 'root' } },
              allow: { to: { file: { categories: 'root' } } },
            },
            // Last so it wins over the broad `feature -> feature` allow above.
            {
              from: { element: { type: 'feature' } },
              disallow: { to: { element: { type: 'feature', feature: '!{{from.feature}}' } } },
              message:
                'A feature must not import another feature directly; share code through `shared`.',
            },
          ],
        },
      ],
      'boundaries/no-private': 'error',
      'boundaries/no-unknown-dependencies': 'error',
      'boundaries/no-unknown-files': 'error',
    },
  },
);
