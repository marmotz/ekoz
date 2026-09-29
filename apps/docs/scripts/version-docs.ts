import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type Instance = 'sdk' | 'protocol';

const docsRoot = resolve(import.meta.dirname, '..');
const repoRoot = resolve(docsRoot, '..', '..');

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

/**
 * Docs label frozen for a released version, or null while nothing is released.
 * SDK: `major.minor` (patches reuse the minor's docs). Protocol: `major`, or
 * `0.minor` while the major is 0 (minors may still break there).
 */
export function docsLabel(instance: Instance, version: string | null): string | null {
  const match = version ? SEMVER.exec(version) : null;
  if (!match) return null;
  const [, major, minor] = match;
  if (version === '0.0.0') return null;
  if (instance === 'protocol' && major !== '0') return major;
  return `${major}.${minor}`;
}

export function latestProtocolVersion(changelog: string): string | null {
  const heading = /^## \[(\d+\.\d+\.\d+)\]/m.exec(changelog);
  return heading ? heading[1] : null;
}

export function currentVersion(instance: Instance): string | null {
  if (instance === 'sdk') {
    const pkg = JSON.parse(readFileSync(resolve(repoRoot, 'packages/sdk/package.json'), 'utf8'));
    return pkg.version as string;
  }
  return latestProtocolVersion(
    readFileSync(resolve(repoRoot, 'docs/protocol/CHANGELOG.md'), 'utf8'),
  );
}

export function frozenLabels(instance: Instance): string[] {
  const file = resolve(docsRoot, `${instance}_versions.json`);
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as string[]) : [];
}

/** Docs labels that should exist for the current versions but are not frozen yet. */
export function missingVersions(): { instance: Instance; label: string }[] {
  return (['sdk', 'protocol'] as const).flatMap((instance) => {
    const label = docsLabel(instance, currentVersion(instance));
    return label && !frozenLabels(instance).includes(label) ? [{ instance, label }] : [];
  });
}

function main() {
  const missing = missingVersions();
  if (missing.length === 0) {
    console.log('Docs versions are up to date.');
    return;
  }
  if (process.argv.includes('--check')) {
    for (const { instance, label } of missing) {
      console.error(
        `Docs version ${label} is not frozen for '${instance}': run 'bun run docs:version'.`,
      );
    }
    process.exit(1);
  }
  for (const { instance, label } of missing) {
    console.log(`Freezing '${instance}' docs at ${label}`);
    const result = spawnSync('bunx', ['docusaurus', `docs:version:${instance}`, label], {
      cwd: docsRoot,
      stdio: 'inherit',
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}

if (import.meta.main) main();
