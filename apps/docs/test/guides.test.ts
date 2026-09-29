import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import sidebars from '../sidebars';

const docs = resolve(import.meta.dirname, '..', 'docs');

function ids(items: unknown[]): string[] {
  return items.flatMap((item) =>
    typeof item === 'string' ? [item] : ids((item as { items: unknown[] }).items),
  );
}

describe('guides instance', () => {
  const sidebarIds = ids(sidebars.guides as unknown[]);

  it('lists every page required by the guides structure', () => {
    expect(sidebarIds).toEqual([
      'intro',
      'getting-started/quickstart',
      'getting-started/installation',
      'server/deployment',
      'server/configuration',
      'server/operations',
      'security',
      'faq',
    ]);
  });

  it('has a non-empty markdown file behind every sidebar entry', () => {
    for (const id of sidebarIds) {
      const file = resolve(docs, `${id}.md`);
      expect(existsSync(file), id).toBe(true);
      expect(readFileSync(file, 'utf8').length, id).toBeGreaterThan(200);
    }
  });

  it('leaves no placeholder text', () => {
    for (const id of sidebarIds) {
      expect(readFileSync(resolve(docs, `${id}.md`), 'utf8'), id).not.toMatch(/placeholder/i);
    }
  });
});
