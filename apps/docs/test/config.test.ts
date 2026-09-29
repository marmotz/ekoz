import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import config from '../docusaurus.config';

const root = resolve(import.meta.dirname, '..');

type DocsOptions = { id: string; path: string; routeBasePath: string; sidebarPath: string };

function extraInstances(): DocsOptions[] {
  return (config.plugins ?? []).flatMap((plugin) =>
    Array.isArray(plugin) && plugin[0] === '@docusaurus/plugin-content-docs'
      ? [plugin[1] as DocsOptions]
      : [],
  );
}

describe('docusaurus config', () => {
  it('declares the site identity', () => {
    expect(config.url).toBe('https://ekoz.marmotz.dev');
    expect(config.organizationName).toBe('marmotz');
    expect(config.projectName).toBe('ekoz');
  });

  it('uses the classic preset as the unversioned guides instance', () => {
    const preset = config.presets?.[0] as [string, { docs: DocsOptions }];
    expect(preset[0]).toBe('classic');
    expect(preset[1].docs).toMatchObject({ id: 'guides', path: 'docs', routeBasePath: 'guides' });
  });

  it('declares the protocol and sdk instances', () => {
    expect(
      extraInstances().map(({ id, path, routeBasePath }) => ({ id, path, routeBasePath })),
    ).toEqual([
      { id: 'protocol', path: '../../docs/protocol', routeBasePath: 'protocol' },
      { id: 'sdk', path: 'sdk', routeBasePath: 'sdk' },
    ]);
  });

  it('points every instance at existing sidebar and content files', () => {
    const preset = config.presets?.[0] as [string, { docs: DocsOptions }];
    for (const instance of [preset[1].docs, ...extraInstances()]) {
      expect(existsSync(resolve(root, instance.sidebarPath)), instance.id).toBe(true);
      expect(existsSync(resolve(root, instance.path)), instance.id).toBe(true);
    }
  });

  it('indexes the three instances in local search', () => {
    const theme = config.themes?.[0] as [
      string,
      { docsRouteBasePath: string[]; docsPluginIdForPreferredVersion: string },
    ];
    expect(theme[0]).toBe('@easyops-cn/docusaurus-search-local');
    expect(theme[1].docsRouteBasePath).toEqual(['/guides', '/protocol', '/sdk']);
    expect(theme[1].docsPluginIdForPreferredVersion).toBe('guides');
  });

  it('shows a version dropdown for protocol and sdk only', () => {
    const items = (
      config.themeConfig as { navbar: { items: { type: string; docsPluginId?: string }[] } }
    ).navbar.items;
    const dropdowns = items.filter((i) => i.type === 'docsVersionDropdown');
    expect(dropdowns.map((i) => i.docsPluginId)).toEqual(['protocol', 'sdk']);
  });

  it('fails the build on broken links and anchors, and parses markdown as CommonMark', () => {
    expect(config.onBrokenLinks).toBe('throw');
    expect(config.onBrokenAnchors).toBe('throw');
    expect(config.markdown?.format).toBe('detect');
  });

  it('runs the dev and serve commands on port 6010', () => {
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.dev).toContain('--port 6010');
    expect(pkg.scripts.serve).toContain('--port 6010');
  });

  it('labels each version dropdown with its docs instance', () => {
    const items = (
      config.themeConfig as { navbar: { items: { type: string; className?: string }[] } }
    ).navbar.items;
    const classes = items.filter((i) => i.type === 'docsVersionDropdown').map((i) => i.className);
    expect(classes).toEqual([
      'version-dropdown version-dropdown--protocol',
      'version-dropdown version-dropdown--sdk',
    ]);
  });
});
