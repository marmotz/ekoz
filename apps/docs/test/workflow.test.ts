import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');
const workflow = readFileSync(resolve(repoRoot, '.github/workflows/docs.yml'), 'utf8');
const ci = readFileSync(resolve(repoRoot, '.github/workflows/ci.yml'), 'utf8');

describe('docs.yml workflow', () => {
  it('deploys on develop pushes limited to docs-related paths, plus manual dispatch', () => {
    expect(workflow).toContain('branches: [develop]');
    for (const path of [
      'apps/docs/**',
      'packages/sdk/src/**',
      'docs/protocol/**',
      '.github/workflows/docs.yml',
    ]) {
      expect(workflow).toContain(`- '${path}'`);
    }
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).not.toContain('pull_request');
  });

  it('grants the Pages permissions and serialises deployments', () => {
    expect(workflow).toMatch(/contents: read\s+pages: write\s+id-token: write/);
    expect(workflow).toMatch(/group: pages\s+cancel-in-progress: false/);
  });

  it('builds with the shared setup action (SDK built) and uploads the site', () => {
    expect(workflow).toContain('uses: ./.github/actions/setup');
    expect(workflow).not.toContain("build-sdk: 'false'");
    expect(workflow).toContain("bun run --filter '@ekozhq/docs' build");
    expect(workflow).toContain('actions/upload-pages-artifact@v3');
    expect(workflow).toContain('path: apps/docs/build');
  });

  it('deploys after the build in the github-pages environment', () => {
    expect(workflow).toMatch(/needs: build/);
    expect(workflow).toContain('name: github-pages');
    expect(workflow).toContain('actions/deploy-pages@v4');
  });

  it('stays independent from the required ci check', () => {
    expect(ci).not.toContain('docs');
    expect(ci).toMatch(/needs: \[lint, build, test, test-server-integration\]/);
  });

  it('ships the custom domain CNAME', () => {
    const cname = readFileSync(resolve(repoRoot, 'apps/docs/static/CNAME'), 'utf8');
    expect(cname.trim()).toBe('ekoz.marmotz.dev');
  });
});
