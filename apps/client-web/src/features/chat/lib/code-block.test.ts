import { afterEach, describe, expect, it } from 'vitest';

import {
  createTestEditor,
  paste,
  type TestEditor,
  typeText,
} from '@/features/chat/lib/composer-editor.test-helper';

let current: TestEditor | undefined;
const setup = (markdown = '') => {
  current = createTestEditor(markdown);
  return current.editor;
};

afterEach(() => {
  current?.editor.destroy();
  current = undefined;
});

const languageOf = (editor: ReturnType<typeof setup>) => {
  let language: unknown = 'no code block';
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'codeBlock') language = node.attrs.language;
  });
  return language;
};

describe('code block language', () => {
  it('turns an alias into its canonical id on the fence input rule', () => {
    for (const [fence, id] of [
      ['```js ', 'javascript'],
      ['```py ', 'python'],
      ['```sh ', 'bash'],
      ['```yml ', 'yaml'],
      ['```html ', 'xml'],
      ['```c++ ', 'cpp'],
    ]) {
      const editor = setup();
      typeText(editor, fence as string);

      expect(languageOf(editor), fence).toBe(id);
      editor.destroy();
    }
  });

  it('keeps a known id', () => {
    const editor = setup();
    typeText(editor, '```rust ');

    expect(languageOf(editor)).toBe('rust');
  });

  it('turns an unknown language into text', () => {
    const editor = setup();
    typeText(editor, '```klingon ');

    expect(languageOf(editor)).toBe('text');
  });

  it('keeps "no language" as none', () => {
    const editor = setup();
    typeText(editor, '``` ');

    expect(languageOf(editor)).toBeNull();
  });

  it('normalises a body when it is loaded', () => {
    expect(languageOf(setup('```ts\nconst a = 1;\n```'))).toBe('typescript');
    current?.editor.destroy();
    expect(languageOf(setup('```klingon\nx\n```'))).toBe('text');
    current?.editor.destroy();
    expect(languageOf(setup('```\nx\n```'))).toBeNull();
  });

  it('normalises a pasted block', () => {
    const editor = setup();
    paste(editor, { html: '<pre><code class="language-ts">a</code></pre>' });
    expect(languageOf(editor)).toBe('typescript');
    editor.commands.clearContent();

    paste(editor, { html: '<pre><code class="language-klingon">a</code></pre>' });
    expect(languageOf(editor)).toBe('text');
  });
});

describe('code block Markdown', () => {
  it('writes a bare fence for auto-detect, the id for a language and text for plain text', () => {
    const editor = setup('```\ncode\n```');
    expect(editor.getMarkdown().trim()).toBe('```\ncode\n```');

    editor.commands.updateAttributes('codeBlock', { language: 'typescript' });
    expect(editor.getMarkdown().trim()).toBe('```typescript\ncode\n```');

    editor.commands.updateAttributes('codeBlock', { language: 'text' });
    expect(editor.getMarkdown().trim()).toBe('```text\ncode\n```');

    editor.commands.updateAttributes('codeBlock', { language: null });
    expect(editor.getMarkdown().trim()).toBe('```\ncode\n```');
  });

  it('round-trips through the Markdown body', () => {
    for (const source of [
      '```typescript\nconst a = 1;\n```',
      '```text\nplain\n```',
      '```\nbare\n```',
    ]) {
      const editor = setup(source);

      expect(editor.getMarkdown().trim(), source).toBe(source);
      editor.destroy();
    }
  });
});
