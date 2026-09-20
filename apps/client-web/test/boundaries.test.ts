// @vitest-environment node
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const run = promisify(execFile);
const fixtureRoot = fileURLToPath(new URL('./fixtures/boundaries', import.meta.url));
const configFile = fileURLToPath(new URL('../eslint.config.js', import.meta.url));
const eslintBin = fileURLToPath(new URL('../node_modules/.bin/eslint', import.meta.url));

interface LintReport {
  messages: { ruleId: string | null }[];
}

/**
 * The plugin classifies files relative to the process working directory, so ESLint
 * runs as a child process rooted in the fixture tree (mirroring `src/`).
 */
async function lint(file: string) {
  // ESLint exits non-zero when it reports errors; the JSON report is still on stdout.
  const { stdout } = await run(eslintBin, ['--config', configFile, '--format', 'json', file], {
    cwd: fixtureRoot,
  }).catch((error: { stdout?: string }) => ({ stdout: error.stdout ?? '[]' }));
  const [report] = JSON.parse(stdout) as LintReport[];
  return report?.messages.filter((message) => message.ruleId?.startsWith('boundaries/')) ?? [];
}

// Guards the module-boundary matrix of `eslint.config.js` (technical.md §5).
describe('module boundaries', () => {
  it('lets a feature import shared and itself', async () => {
    expect(await lint('src/features/a/uses-own-and-shared.ts')).toEqual([]);
  });

  it('rejects a cross-feature import', async () => {
    const messages = await lint('src/features/a/uses-other-feature.ts');

    expect(messages).toHaveLength(1);
    expect(messages[0]?.ruleId).toBe('boundaries/dependencies');
  });

  it('rejects a cross-feature import through the `@/` alias', async () => {
    expect(await lint('src/features/a/uses-other-feature-alias.ts')).toHaveLength(1);
  });

  it('rejects shared importing a feature', async () => {
    expect(await lint('src/shared/uses-feature.ts')).toHaveLength(1);
  });

  it('rejects app importing routes', async () => {
    expect(await lint('src/app/uses-route.ts')).toHaveLength(1);
  });

  it('lets routes import features and shared', async () => {
    expect(await lint('src/routes/page.ts')).toEqual([]);
  });
});
