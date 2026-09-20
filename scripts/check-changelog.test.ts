import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';

const script = new URL('./check-changelog.sh', import.meta.url).pathname;

const CHANGELOG = `# Changelog

## [Unreleased]

### Added

- Existing entry.

## [1.0.0]

### Added

- Released entry.
`;

let repo: string;

function git(...args: string[]) {
  execFileSync('git', args, {
    cwd: repo,
    stdio: 'ignore',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 't',
      GIT_AUTHOR_EMAIL: 't@t',
      GIT_COMMITTER_NAME: 't',
      GIT_COMMITTER_EMAIL: 't@t',
    },
  });
}

function write(path: string, content: string) {
  const full = join(repo, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

/** Commits `files` on a branch off the base commit, then runs the check against it. */
function check(files: Record<string, string>) {
  git('checkout', '-q', '-b', 'change');
  for (const [path, content] of Object.entries(files)) write(path, content);
  git('add', '-A');
  git('commit', '-q', '-m', 'change');
  return spawnSync('bash', [script, 'base'], { cwd: repo, encoding: 'utf8' });
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'check-changelog-'));
  git('init', '-q', '-b', 'main');
  write('apps/client-web/src/a.ts', 'export const a = 1;\n');
  write('apps/client-web/CHANGELOG.md', CHANGELOG);
  write('packages/sdk/src/a.ts', 'export const a = 1;\n');
  write('.changeset/README.md', '# Changesets\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  git('branch', 'base');
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

it('passes when no source file changed', () => {
  expect(check({ 'docs/a.md': 'x' }).status).toBe(0);
});

it('fails when an app src changes without a changelog entry', () => {
  const result = check({ 'apps/client-web/src/a.ts': 'export const a = 2;\n' });

  expect(result.status).toBe(1);
  expect(result.stdout).toContain('apps/client-web');
});

it('passes when the entry is added under [Unreleased]', () => {
  const changelog = CHANGELOG.replace('- Existing entry.\n', '- Existing entry.\n- New entry.\n');

  const result = check({
    'apps/client-web/src/a.ts': 'export const a = 2;\n',
    'apps/client-web/CHANGELOG.md': changelog,
  });

  expect(result.status).toBe(0);
});

it('fails when the entry is added under a released version', () => {
  const changelog = CHANGELOG.replace('- Released entry.\n', '- Released entry.\n- Late entry.\n');

  const result = check({
    'apps/client-web/src/a.ts': 'export const a = 2;\n',
    'apps/client-web/CHANGELOG.md': changelog,
  });

  expect(result.status).toBe(1);
});

it('ignores changes to test files only', () => {
  expect(check({ 'apps/client-web/src/a.test.ts': 'test' }).status).toBe(0);
});

it('requires a changeset when packages/sdk/src changes', () => {
  const result = check({ 'packages/sdk/src/a.ts': 'export const a = 2;\n' });

  expect(result.status).toBe(1);
  expect(result.stdout).toContain('changeset');
});

it('accepts a new changeset for packages/sdk', () => {
  const result = check({
    'packages/sdk/src/a.ts': 'export const a = 2;\n',
    '.changeset/brave-lions-run.md': '---\n"@ekozhq/sdk": patch\n---\n\nChange.\n',
  });

  expect(result.status).toBe(0);
});
