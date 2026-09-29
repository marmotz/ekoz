import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import sidebars from '../sidebars-protocol';

// The Docusaurus `protocol` instance reads the specification directly: no copy.
const sourceDir = resolve(import.meta.dirname, '..', '..', '..', 'docs', 'protocol');

const sidebarIds = sidebars.protocol as string[];
const specPages = [
  'discovery',
  'identity',
  'rooms-and-permissions',
  'messages-and-interactions',
  'files-and-sharing',
  'synchronisation',
  'presence-and-typing',
];

// Sidebar ids are file names: README.md is the overview and CHANGELOG.md the changelog.
const fileOf = (id: string) => `${id}.md`;
const read = (id: string) => readFileSync(resolve(sourceDir, fileOf(id)), 'utf8');

describe('protocol instance', () => {
  it('lists the overview, every spec page and the changelog', () => {
    expect(sidebarIds).toEqual(['README', ...specPages, 'CHANGELOG']);
  });

  it('has a non-empty markdown file behind every sidebar entry, and no orphan', () => {
    for (const id of sidebarIds) {
      expect(existsSync(resolve(sourceDir, fileOf(id))), id).toBe(true);
      expect(read(id).length, id).toBeGreaterThan(500);
    }
    const files = readdirSync(sourceDir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.replace(/\.md$/, ''))
      .sort();
    expect(files).toEqual([...sidebarIds].sort());
  });

  it('publishes the repository README as the overview at the section root', () => {
    expect(read('README')).toMatch(/^---\nslug: \/\n---\n/);
    expect(read('README')).toMatch(/^## Principles$/m);
  });

  it('covers every page of the source specification', () => {
    const sources = readdirSync(sourceDir)
      .filter((f) => f.endsWith('.md') && f !== 'README.md' && f !== 'CHANGELOG.md')
      .map((f) => f.replace(/\.md$/, ''));
    for (const id of sources) {
      expect(sidebarIds, id).toContain(id);
    }
  });

  it('leaves no placeholder text', () => {
    for (const id of sidebarIds) {
      expect(read(id), id).not.toMatch(/placeholder/i);
    }
  });

  it('does not leak repository-internal references', () => {
    for (const id of sidebarIds) {
      const text = read(id);
      expect(text, id).not.toMatch(/\.\.\/technical\//);
      expect(text, id).not.toMatch(/apps\/server/);
      expect(text, id).not.toMatch(/technical\.md/);
      expect(text, id).not.toMatch(/\bissues? #\d+/i);
      expect(text, id).not.toMatch(/\(#\d+\)/);
      expect(text, id).not.toMatch(/\bbacklog\//);
      expect(text, id).not.toMatch(/\b(draft|increment)\b/i);
    }
  });
});
