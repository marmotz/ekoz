import { afterEach, describe, expect, it } from 'vitest';

import {
  createTestEditor,
  paste,
  type TestEditor,
  typeText,
} from '@/features/chat/lib/composer-editor.test-helper';
import { normaliseLinkUrl } from '@/features/chat/lib/composer-link';
import { readLinkTarget } from '@/features/chat/lib/link-target';

let current: TestEditor | undefined;
const setup = (markdown = '') => {
  current = createTestEditor(markdown);
  return current.editor;
};

afterEach(() => {
  current?.editor.destroy();
  current = undefined;
});

const linkHrefs = (editor: ReturnType<typeof setup>) => {
  const hrefs: string[] = [];
  editor.state.doc.descendants((node) => {
    for (const mark of node.marks) if (mark.type.name === 'link') hrefs.push(mark.attrs.href);
  });
  return hrefs;
};

describe('link scheme rule', () => {
  it('accepts http, https and mailto only', () => {
    const editor = setup('text');
    editor.commands.selectAll();

    expect(editor.commands.setLink({ href: 'https://example.test' })).toBe(true);
    expect(editor.commands.setLink({ href: 'http://example.test' })).toBe(true);
    expect(editor.commands.setLink({ href: 'mailto:jane@example.test' })).toBe(true);
    for (const href of [
      'javascript:alert(1)',
      'ftp://example.test',
      'data:text/html,x',
      '/relative',
    ]) {
      editor.commands.unsetLink();
      expect(editor.commands.setLink({ href }), href).toBe(false);
      expect(linkHrefs(editor), href).toEqual([]);
    }
  });

  it('normalises what a user types', () => {
    expect(normaliseLinkUrl('https://example.test/a')).toBe('https://example.test/a');
    expect(normaliseLinkUrl('  example.test  ')).toBe('https://example.test');
    expect(normaliseLinkUrl('mailto:jane@example.test')).toBe('mailto:jane@example.test');
    expect(normaliseLinkUrl('javascript:alert(1)')).toBeNull();
    expect(normaliseLinkUrl('ftp://example.test')).toBeNull();
    expect(normaliseLinkUrl('')).toBeNull();
    expect(normaliseLinkUrl('http://')).toBeNull();
  });
});

describe('links in the editor', () => {
  it('linkifies a bare URL once it is followed by a space', () => {
    const editor = setup();
    typeText(editor, 'see https://example.test/page ');

    expect(linkHrefs(editor)).toEqual(['https://example.test/page']);
  });

  it('links the selection when a URL is pasted over it', () => {
    const editor = setup('click here now');
    editor.commands.setTextSelection({ from: 7, to: 11 });

    paste(editor, { text: 'https://example.test' });

    expect(linkHrefs(editor)).toEqual(['https://example.test']);
    expect(editor.state.doc.textContent).toBe('click here now');
  });

  it('does not link a pasted URL with another scheme', () => {
    const editor = setup('click here now');
    editor.commands.setTextSelection({ from: 7, to: 11 });

    paste(editor, { text: 'javascript:alert(1)' });

    expect(linkHrefs(editor)).toEqual([]);
  });

  it('does not follow a link on click', () => {
    const editor = setup('[a link](https://example.test)');

    expect(
      editor.extensionManager.extensions.find((ext) => ext.name === 'link')?.options.openOnClick,
    ).toBe(false);
  });

  it('serialises a link as Markdown', () => {
    const editor = setup('[a link](https://example.test)');

    expect(editor.getMarkdown()).toBe('[a link](https://example.test)');
  });
});

describe('link target', () => {
  it('reads the whole range of the link under the cursor', () => {
    const editor = setup('go [to site](https://example.test) now');
    editor.commands.setTextSelection(6);

    expect(readLinkTarget(editor)).toMatchObject({
      text: 'to site',
      href: 'https://example.test',
      editing: true,
    });
  });

  it('reads the selected text when there is no link', () => {
    const editor = setup('plain words');
    editor.commands.setTextSelection({ from: 1, to: 6 });

    expect(readLinkTarget(editor)).toMatchObject({ text: 'plain', href: '', editing: false });
  });

  it('is an empty range at the cursor with no selection', () => {
    const editor = setup('plain');
    editor.commands.setTextSelection(3);

    expect(readLinkTarget(editor)).toMatchObject({ text: '', from: 3, to: 3, editing: false });
  });
});
