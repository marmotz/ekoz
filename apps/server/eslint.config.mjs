import boundaries from 'eslint-plugin-boundaries';
import tseslint from 'typescript-eslint';

// ESLint here has a single job: enforce the module-boundary rule that Biome
// cannot express. Formatting and general linting are Biome's (see root
// biome.json). Run via `bun run --filter '@ekozhq/server' lint:boundaries`.
export default tseslint.config(
  {
    ignores: ['node_modules/**', 'dist/**', 'src/core/prisma/generated/**', 'coverage/**'],
  },
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { sourceType: 'module' },
    },
    plugins: { boundaries },
    settings: {
      'boundaries/include': ['src/**/*'],
      'boundaries/elements': [
        { type: 'core', pattern: 'src/core/*', capture: ['group'] },
        { type: 'feature', pattern: 'src/modules/*', capture: ['feature'] },
      ],
    },
    rules: {
      // A functional feature must not import another feature directly: they talk
      // through explicit provider interfaces or events (server-core technical.md §1).
      'boundaries/dependencies': [
        'error',
        {
          default: 'allow',
          policies: [
            {
              from: [{ element: { type: 'feature' } }],
              disallow: [{ to: { element: { type: 'feature', feature: '!{{from.feature}}' } } }],
              message:
                'A feature module must not import another feature directly. Use a provider interface or an event.',
            },
          ],
        },
      ],
    },
  },
);
