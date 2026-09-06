import eslint from '@eslint/js';
import boundaries from 'eslint-plugin-boundaries';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'src/core/prisma/generated/**',
      'prisma/migrations/**',
      'coverage/**',
      '.agents/**',
      '.claude/**',
      '.cursor/**',
      '.devin/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        projectService: {
          allowDefaultProject: ['eslint.config.mjs'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['src/**/*.ts'],
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
      // through explicit provider interfaces or events (technical.md §1).
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
  {
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts', 'src/**/testing/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  }
);
