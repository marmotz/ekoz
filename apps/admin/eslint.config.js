import boundaries from 'eslint-plugin-boundaries';
import tseslint from 'typescript-eslint';

// ESLint here has a single job: enforce the module-boundary rule that Biome
// cannot express. Formatting and general linting are Biome's (see root
// biome.json). Run via `bun run --filter '@ekozhq/admin' lint:boundaries`.
export default tseslint.config(
  {
    ignores: ['node_modules/**', 'dist/**', '.output/**', 'src/routeTree.gen.ts', 'coverage/**'],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { sourceType: 'module' },
    },
    plugins: { boundaries },
    settings: {
      'boundaries/include': ['src/**/*'],
      'boundaries/elements': [
        { type: 'app', pattern: 'src/app/*' },
        { type: 'server', pattern: 'src/server/*' },
        { type: 'routes', pattern: 'src/routes/**/*' },
        { type: 'shared', pattern: 'src/shared/**/*' },
      ],
    },
    rules: {
      // routes may import shared/app/server; shared imports only shared (server-administration/technical.md §5).
      'boundaries/dependencies': [
        'error',
        {
          default: 'allow',
          policies: [
            {
              from: [{ element: { type: 'shared' } }],
              disallow: [{ to: { element: { type: ['app', 'server', 'routes'] } } }],
              message: 'A `shared` module must only import other `shared` modules.',
            },
          ],
        },
      ],
    },
  },
);
