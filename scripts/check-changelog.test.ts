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
  write('apps/docs/docs/a.md', 'a\n');
  write('apps/docs/CHANGELOG.md', CHANGELOG);
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

it.each(['docs', 'sdk', 'src'])(
  'fails when apps/docs/%s content changes without a changelog entry',
  (dir) => {
    const result = check({ [`apps/docs/${dir}/a.md`]: 'changed\n' });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('apps/docs');
  },
);

it('passes when apps/docs content changes with an [Unreleased] entry', () => {
  const result = check({
    'apps/docs/docs/a.md': 'changed\n',
    'apps/docs/CHANGELOG.md': CHANGELOG.replace(
      '- Existing entry.\n',
      '- Existing entry.\n- Docs entry.\n',
    ),
  });

  expect(result.status).toBe(0);
});

it('ignores apps/docs test-only changes', () => {
  expect(check({ 'apps/docs/test/a.test.ts': 'test' }).status).toBe(0);
});

const ENTRY = CHANGELOG.replace('- Existing entry.\n', '- Existing entry.\n- New entry.\n');

/** Leaves `files` uncommitted on a branch off base, then runs the script in `mode`. */
function checkUncommitted(
  mode: '--worktree' | '--staged',
  files: Record<string, string>,
  stage: boolean,
) {
  git('checkout', '-q', '-b', 'change');
  for (const [path, content] of Object.entries(files)) write(path, content);
  if (stage) git('add', '-A');
  return spawnSync('bash', [script, mode, 'base'], { cwd: repo, encoding: 'utf8' });
}

it('--worktree fails on an uncommitted src change without an entry', () => {
  const result = checkUncommitted(
    '--worktree',
    { 'apps/client-web/src/a.ts': 'export const a = 2;\n' },
    false,
  );

  expect(result.status).toBe(1);
  expect(result.stdout).toContain('apps/client-web');
});

it('--worktree counts untracked files and an uncommitted entry', () => {
  const result = checkUncommitted(
    '--worktree',
    {
      'apps/client-web/src/new.ts': 'export const n = 1;\n',
      'apps/client-web/CHANGELOG.md': ENTRY,
    },
    false,
  );

  expect(result.status).toBe(0);
});

it('--worktree does not stage anything', () => {
  checkUncommitted('--worktree', { 'apps/client-web/src/new.ts': 'export const n = 1;\n' }, false);

  const staged = execFileSync('git', ['diff', '--cached', '--name-only'], {
    cwd: repo,
    encoding: 'utf8',
  });
  expect(staged).toBe('');
});

it('--staged only sees staged content', () => {
  git('checkout', '-q', '-b', 'change');
  write('apps/client-web/src/a.ts', 'export const a = 2;\n');
  git('add', '-A');
  write('apps/client-web/CHANGELOG.md', ENTRY);

  const result = spawnSync('bash', [script, '--staged', 'base'], { cwd: repo, encoding: 'utf8' });

  expect(result.status).toBe(1);
});

it('--staged passes once the entry is staged too', () => {
  const result = checkUncommitted(
    '--staged',
    { 'apps/client-web/src/a.ts': 'export const a = 2;\n', 'apps/client-web/CHANGELOG.md': ENTRY },
    true,
  );

  expect(result.status).toBe(0);
});

it('does not require an apps/docs entry for docs/protocol changes', () => {
  expect(check({ 'docs/protocol/a.md': 'changed\n' }).status).toBe(0);
});
