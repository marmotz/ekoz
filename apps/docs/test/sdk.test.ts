import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import config from '../docusaurus.config';

const root = resolve(import.meta.dirname, '..');
const guide = resolve(root, 'sdk', 'guide');
const sidebarSource = readFileSync(resolve(root, 'sidebars-sdk.ts'), 'utf8');

type TypedocOptions = {
  entryPoints: string[];
  tsconfig: string;
  out: string;
  docsPath: string;
  readme: string;
  sidebar: { autoConfiguration: boolean };
};

function typedocOptions(): TypedocOptions {
  const plugin = (config.plugins ?? []).find(
    (entry) => Array.isArray(entry) && entry[0] === 'docusaurus-plugin-typedoc',
  );
  return (plugin as [string, TypedocOptions]).at(1) as TypedocOptions;
}

describe('sdk instance', () => {
  it('generates the API reference from the SDK entry point into the sdk tree', () => {
    const options = typedocOptions();
    expect(existsSync(resolve(root, options.entryPoints[0] as string))).toBe(true);
    expect(existsSync(resolve(root, options.tsconfig))).toBe(true);
    expect(options.out).toBe('sdk/api');
    expect(options.docsPath).toBe('./sdk');
    expect(options.readme).toBe('none');
    expect(options.sidebar.autoConfiguration).toBe(true);
  });

  it('keeps the generated API output out of git', () => {
    expect(readFileSync(resolve(root, '.gitignore'), 'utf8')).toMatch(/^sdk\/api\/$/m);
  });

  it('declares the TypeDoc packages as dependencies', () => {
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    for (const name of ['docusaurus-plugin-typedoc', 'typedoc', 'typedoc-plugin-markdown']) {
      expect(pkg.dependencies[name], name).toBeDefined();
    }
  });

  it('wires a Guide category and the generated API reference in the sidebar', () => {
    expect(sidebarSource).toContain("'guide/quickstart'");
    expect(sidebarSource).toContain("'guide/auth'");
    expect(sidebarSource).toContain("'guide/realtime'");
    expect(sidebarSource).toContain('./sdk/api/typedoc-sidebar.cjs');
    expect(sidebarSource).toContain("id: 'api/index'");
  });

  it('has a substantial page behind every guide entry, without placeholder text', () => {
    for (const name of ['intro', 'quickstart', 'auth', 'realtime']) {
      const file = resolve(guide, `${name}.md`);
      expect(existsSync(file), name).toBe(true);
      const text = readFileSync(file, 'utf8');
      expect(text.length, name).toBeGreaterThan(400);
      expect(text, name).not.toMatch(/placeholder/i);
    }
  });

  it('documents the real package name and stream event names', () => {
    const all = ['quickstart', 'auth', 'realtime']
      .map((name) => readFileSync(resolve(guide, `${name}.md`), 'utf8'))
      .join('\n');
    expect(all).toContain('@ekozhq/sdk');
    expect(all).not.toContain('@ekoz/sdk');
    expect(all).toContain("client.stream.on('room_event'");
  });
});
