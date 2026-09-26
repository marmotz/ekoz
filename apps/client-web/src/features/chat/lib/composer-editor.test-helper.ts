import { Editor } from '@tiptap/react';
import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import { vi } from 'vitest';

import { buildComposerExtensions } from '@/features/chat/lib/composer-extensions';
import { createComposerHandlers } from '@/features/chat/lib/composer-handlers';

/** The mdast node types the server accepts (`restricted-markdown.ts`). */
const SERVER_NODE_TYPES = new Set([
  'root',
  'paragraph',
  'text',
  'emphasis',
  'strong',
  'delete',
  'inlineCode',
  'code',
  'blockquote',
  'list',
  'listItem',
  'link',
  'break',
]);

/** Node types of `source` outside the server subset, or a link outside http(s) and mailto. */
export function serverRejections(source: string): string[] {
  const rejected: string[] = [];
  const walk = (node: { type: string; url?: string; children?: unknown[] }) => {
    if (!SERVER_NODE_TYPES.has(node.type)) rejected.push(node.type);
    if (node.type === 'link' && !/^(https?:|mailto:)/i.test(node.url ?? '')) rejected.push('link');
    for (const child of node.children ?? []) walk(child as typeof node);
  };
  walk(remark().use(remarkGfm).parse(source) as never);
  return rejected;
}

export interface TestEditor {
  editor: Editor;
  send: ReturnType<typeof vi.fn>;
  openLink: ReturnType<typeof vi.fn>;
  setSuggestionOpen: (open: boolean) => void;
}

/** The composer's extension set on a bare editor, with spy callbacks. */
export function createTestEditor(markdown = ''): TestEditor {
  const bridge = createComposerHandlers();
  const send = vi.fn();
  const openLink = vi.fn();
  let suggestionOpen = false;
  bridge.update({ send, openLink, isSuggestionOpen: () => suggestionOpen });

  const editor = new Editor({
    element: document.createElement('div'),
    extensions: buildComposerExtensions({
      suggestion: { char: '@', items: () => [] } as never,
      handlers: bridge.handlers,
    }),
    content: markdown,
    contentType: 'markdown',
  });

  return {
    editor,
    send,
    openLink,
    setSuggestionOpen: (open) => {
      suggestionOpen = open;
    },
  };
}

/** Types `text` the way the browser does, so Markdown input rules run. */
export function typeText(editor: Editor, text: string) {
  for (const char of text) {
    const { from, to } = editor.state.selection;
    const handled = editor.view.someProp('handleTextInput', (handle) =>
      handle(editor.view, from, to, char, () => editor.state.tr.insertText(char, from, to)),
    );
    if (!handled) editor.view.dispatch(editor.state.tr.insertText(char, from, to));
  }
}

/** Presses a key; true when the editor handled it (the browser would not act on it). */
export function press(editor: Editor, key: string, init: KeyboardEventInit = {}): boolean {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  return Boolean(editor.view.someProp('handleKeyDown', (handle) => handle(editor.view, event)));
}

/** Pastes `html` (or plain `text`) through the editor's own paste logic. */
export function paste(editor: Editor, { html, text }: { html?: string; text?: string }) {
  // jsdom has no ClipboardEvent; the paste hooks only read `clipboardData` from it.
  const clipboardData = {
    getData: (type: string) =>
      type === 'text/html' ? (html ?? '') : type === 'text/plain' ? (text ?? '') : '',
  };
  const event = Object.assign(new Event('paste'), { clipboardData }) as never;
  if (html !== undefined) editor.view.pasteHTML(html, event);
  else editor.view.pasteText(text ?? '', event);
}
