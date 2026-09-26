import { afterEach, describe, expect, it } from 'vitest';

import {
  createTestEditor,
  paste,
  press,
  serverRejections,
  type TestEditor,
  typeText,
} from '@/features/chat/lib/composer-editor.test-helper';

let current: TestEditor | undefined;
const setup = (markdown = '') => {
  current = createTestEditor(markdown);
  return current;
};

afterEach(() => {
  current?.editor.destroy();
  current = undefined;
});

const nodeTypes = (editor: TestEditor['editor']) => {
  const types: string[] = [];
  editor.state.doc.descendants((node) => {
    types.push(node.type.name);
  });
  return types;
};

const hasMark = (editor: TestEditor['editor'], name: string) => {
  let found = false;
  editor.state.doc.descendants((node) => {
    if (node.marks.some((mark) => mark.type.name === name)) found = true;
  });
  return found;
};

describe('schema', () => {
  it('keeps heading, rule and image inputs as literal text', () => {
    for (const input of [
      '# title',
      '## title',
      '--- ',
      '***  ',
      '![alt](https://example.test/a.png)',
    ]) {
      const { editor } = setup();
      typeText(editor, input);

      expect(nodeTypes(editor), input).not.toContain('heading');
      expect(nodeTypes(editor), input).not.toContain('horizontalRule');
      expect(nodeTypes(editor), input).not.toContain('image');
      expect(editor.state.doc.textContent).toBe(input);
      editor.destroy();
    }
  });

  it('has no underline mark', () => {
    const { editor } = setup();
    expect(editor.schema.marks.underline).toBeUndefined();
    expect(editor.schema.nodes.heading).toBeUndefined();
    expect(editor.schema.nodes.horizontalRule).toBeUndefined();
  });

  it('always serialises to a body the server subset accepts', () => {
    const samples = [
      '**bold** *italic* ~~strike~~ `code`',
      '> quote\n>\n> more',
      '- one\n- two\n  - nested',
      '1. one\n2. two',
      '```ts\nconst a = 1;\n```',
      '```\nplain\n```',
      '```text\nplain\n```',
      '[a link](https://example.test) and https://example.test/bare',
      'first  \nsecond',
      '# not a heading\n\n---\n\n![not an image](https://example.test/a.png)',
    ];
    for (const sample of samples) {
      const { editor } = setup(sample);

      expect(serverRejections(editor.getMarkdown()), sample).toEqual([]);
      editor.destroy();
    }
  });
});

describe('Markdown input rules', () => {
  it.each([
    ['**bold**', 'bold'],
    ['*italic*', 'italic'],
    ['~~strike~~', 'strike'],
    ['`code`', 'code'],
  ])('turns %s into a mark', (input, mark) => {
    const { editor } = setup();
    typeText(editor, input);

    expect(hasMark(editor, mark)).toBe(true);
  });

  it.each([
    ['> ', 'blockquote'],
    ['- ', 'bulletList'],
    ['1. ', 'orderedList'],
  ])('turns %s at the start of a line into a node', (input, node) => {
    const { editor } = setup();
    typeText(editor, input);

    expect(nodeTypes(editor)).toContain(node);
  });

  it('turns ```lang into a code block whose language is normalised', () => {
    const { editor } = setup();
    typeText(editor, '```ts ');

    expect(editor.getAttributes('codeBlock').language).toBe('typescript');
  });

  it('reverts a mark with Backspace right after it, back to the literal text', () => {
    const { editor } = setup();
    typeText(editor, '**bold**');
    expect(hasMark(editor, 'bold')).toBe(true);

    expect(press(editor, 'Backspace')).toBe(true);

    expect(hasMark(editor, 'bold')).toBe(false);
    expect(editor.state.doc.textContent).toBe('**bold**');
  });

  it('reverts a block with Backspace right after it, back to a paragraph', () => {
    const cases = [
      { input: '- ', node: 'bulletList' },
      { input: '> ', node: 'blockquote' },
      { input: '```ts ', node: 'codeBlock' },
    ];
    for (const { input, node } of cases) {
      const { editor } = setup();
      typeText(editor, input);
      expect(nodeTypes(editor), input).toContain(node);

      expect(press(editor, 'Backspace'), input).toBe(true);

      expect(nodeTypes(editor), input).not.toContain(node);
      editor.destroy();
    }
  });

  it('reverts a conversion with undo', () => {
    const { editor } = setup();
    typeText(editor, '**bold**');
    expect(hasMark(editor, 'bold')).toBe(true);

    editor.commands.undo();

    expect(hasMark(editor, 'bold')).toBe(false);
  });
});

describe('Enter rules', () => {
  it('sends on Enter in a paragraph, a list and a code block, without a new line', () => {
    for (const markdown of ['hello', '- item', '```\ncode\n```']) {
      const { editor, send } = setup(markdown);
      editor.commands.focus('end');
      const before = editor.getJSON();

      expect(press(editor, 'Enter'), markdown).toBe(true);

      expect(send, markdown).toHaveBeenCalledTimes(1);
      expect(editor.getJSON(), markdown).toEqual(before);
      editor.destroy();
    }
  });

  it('does not act while an IME is composing', () => {
    const { editor, send } = setup('hello');
    editor.commands.focus('end');

    // ProseMirror itself skips `keydown` while composing; the rule must not send either way.
    press(editor, 'Enter', { isComposing: true });
    press(editor, 'Enter', { keyCode: 229 });

    expect(send).not.toHaveBeenCalled();
  });

  it('leaves Enter to the mention suggestion while its popup is open', () => {
    const { editor, send, setSuggestionOpen } = setup('hello');
    editor.commands.focus('end');
    setSuggestionOpen(true);

    press(editor, 'Enter');

    expect(send).not.toHaveBeenCalled();
  });

  it('sends again once the popup is closed', () => {
    const { editor, send, setSuggestionOpen } = setup('hello');
    editor.commands.focus('end');
    setSuggestionOpen(true);
    press(editor, 'Enter');
    setSuggestionOpen(false);

    press(editor, 'Enter');

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('leaves Ctrl+Enter and Alt+Enter alone', () => {
    const { editor, send } = setup('hello');
    editor.commands.focus('end');

    press(editor, 'Enter', { altKey: true });

    expect(send).not.toHaveBeenCalled();
  });

  it('inserts a hard break with Shift+Enter in a paragraph', () => {
    const { editor, send } = setup('one');
    editor.commands.focus('end');

    expect(press(editor, 'Enter', { shiftKey: true })).toBe(true);
    typeText(editor, 'two');

    expect(nodeTypes(editor)).toContain('hardBreak');
    expect(nodeTypes(editor).filter((type) => type === 'paragraph')).toHaveLength(1);
    expect(send).not.toHaveBeenCalled();
  });

  it('splits the item with Shift+Enter in a list, and lifts out of an empty item', () => {
    const { editor } = setup('- one');
    editor.commands.focus('end');

    press(editor, 'Enter', { shiftKey: true });
    expect(nodeTypes(editor).filter((type) => type === 'listItem')).toHaveLength(2);

    press(editor, 'Enter', { shiftKey: true });
    expect(nodeTypes(editor).filter((type) => type === 'listItem')).toHaveLength(1);
    expect(editor.state.doc.lastChild?.type.name).toBe('paragraph');
  });

  it('inserts a newline with Shift+Enter in a code block', () => {
    const { editor, send } = setup('```\nabc\n```');
    editor.commands.focus('end');

    expect(press(editor, 'Enter', { shiftKey: true })).toBe(true);
    typeText(editor, 'def');

    expect(editor.state.doc.firstChild?.textContent).toBe('abc\ndef');
    expect(send).not.toHaveBeenCalled();
  });

  it('exits the code block on the third Shift+Enter at its end', () => {
    const { editor } = setup('```\nabc\n```');
    editor.commands.focus('end');

    press(editor, 'Enter', { shiftKey: true });
    press(editor, 'Enter', { shiftKey: true });
    expect(editor.state.doc.firstChild?.textContent).toBe('abc\n\n');
    press(editor, 'Enter', { shiftKey: true });

    expect(editor.state.doc.firstChild?.textContent).toBe('abc');
    expect(editor.state.doc.lastChild?.type.name).toBe('paragraph');
    expect(editor.state.selection.$from.parent.type.name).toBe('paragraph');
  });
});

describe('typed code fence', () => {
  it.each([
    ['Enter', {}],
    ['Enter', { shiftKey: true }],
  ])('opens a code block on %s after ```ts, with the normalised language', (key, init) => {
    const { editor, send } = setup();
    typeText(editor, '```ts');

    expect(press(editor, key, init)).toBe(true);
    typeText(editor, "import '@ekoz/server';");

    expect(send).not.toHaveBeenCalled();
    expect(editor.getMarkdown().trim()).toBe("```typescript\nimport '@ekoz/server';\n```");
  });

  it('opens a block without language on a bare fence', () => {
    const { editor } = setup();
    typeText(editor, '```');

    press(editor, 'Enter', { shiftKey: true });

    expect(nodeTypes(editor)).toContain('codeBlock');
    expect(editor.getAttributes('codeBlock').language).toBeNull();
  });

  it('leaves a fence with other text on the line alone', () => {
    const { editor, send } = setup();
    typeText(editor, 'see ```ts');

    press(editor, 'Enter');

    expect(nodeTypes(editor)).not.toContain('codeBlock');
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('paste', () => {
  it('keeps the supported formatting', () => {
    const { editor } = setup();
    paste(editor, {
      html:
        '<p><strong>b</strong> <em>i</em> <s>s</s> <code>c</code> <a href="https://example.test">l</a></p>' +
        '<ul><li>one</li></ul><blockquote>q</blockquote><pre><code class="language-py">x = 1</code></pre>',
    });

    for (const mark of ['bold', 'italic', 'strike', 'code', 'link']) {
      expect(hasMark(editor, mark), mark).toBe(true);
    }
    expect(nodeTypes(editor)).toEqual(
      expect.arrayContaining(['bulletList', 'blockquote', 'codeBlock']),
    );
    let language: unknown;
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'codeBlock') language = node.attrs.language;
    });
    expect(language).toBe('python');
    expect(serverRejections(editor.getMarkdown())).toEqual([]);
  });

  it('reduces headings, tables, images, colours and underline to text', () => {
    const { editor } = setup();
    paste(editor, {
      html:
        '<h1>Title</h1><table><tr><td>cell</td></tr></table><p><img src="https://example.test/a.png" alt="pic">' +
        '<span style="color: red">red</span> <u>under</u></p>',
    });

    const types = nodeTypes(editor);
    for (const rejected of ['heading', 'table', 'image']) expect(types).not.toContain(rejected);
    const text = editor.state.doc.textContent;
    for (const word of ['Title', 'cell', 'red', 'under']) expect(text).toContain(word);
    expect(editor.getHTML()).not.toContain('color');
    expect(serverRejections(editor.getMarkdown())).toEqual([]);
  });

  it('does not parse a plain text paste as Markdown', () => {
    const { editor } = setup();
    paste(editor, { text: '**not bold** and # not a heading' });

    expect(hasMark(editor, 'bold')).toBe(false);
    expect(editor.state.doc.textContent).toBe('**not bold** and # not a heading');
  });

  it('drops a link whose scheme is not allowed', () => {
    const { editor } = setup();
    paste(editor, { html: '<p><a href="javascript:alert(1)">bad</a></p>' });

    expect(hasMark(editor, 'link')).toBe(false);
    expect(editor.state.doc.textContent).toBe('bad');
  });
});
