import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Extension } from '@tiptap/react';

import { resolveLanguage } from '@/shared/messages/code-languages';

/** A line holding only an opening fence, with an optional language: ```` ```ts ````. */
const OPENING_FENCE = /^(?:```|~~~)([^\s`~]*)$/;

export interface SendOnEnterOptions {
  /** Called by Enter. A blank body or a body over the limit is the caller's call. */
  send: () => void;
  /** True while the `@` popup is open: Enter then picks a suggestion, it does not send. */
  isSuggestionOpen: () => boolean;
}

/**
 * Enter rules of the composer (web-client-composer-formatting technical design C2).
 *
 * - `Enter` sends, in a paragraph, a list and a code block alike. It is ignored while
 *   an IME is composing, and left to the mention suggestion while its popup is open.
 * - `Shift+Enter` is a hard break in a paragraph, splits the item in a list (and lifts
 *   out of the list on an empty item) and is a newline in a code block, where three in
 *   a row at the end exit the block (`exitOnTripleEnter` is off on the code block,
 *   because it is bound to `Enter`).
 *
 * The priority sits above the nodes' own `Enter` bindings, which would otherwise split
 * the list item or add a newline to the code block before this runs.
 */
export const SendOnEnter = Extension.create<SendOnEnterOptions>({
  name: 'sendOnEnter',
  priority: 900,

  addOptions() {
    return { send: () => {}, isSuggestionOpen: () => false };
  },

  addProseMirrorPlugins() {
    const { editor, options } = this;

    return [
      new Plugin({
        key: new PluginKey('sendOnEnter'),
        props: {
          handleKeyDown: (_view, event) => {
            if (event.key !== 'Enter' || event.ctrlKey || event.altKey || event.metaKey)
              return false;
            if (event.isComposing || event.keyCode === 229) return false;

            // A typed opening fence opens a code block on Enter and Shift+Enter, as the
            // input rule does on a space (nobody sends a lone fence).
            const { $from: cursor, empty: collapsed } = editor.state.selection;
            const fence = OPENING_FENCE.exec(cursor.parent.textContent);
            if (
              fence &&
              collapsed &&
              cursor.parent.type.name === 'paragraph' &&
              cursor.parentOffset === cursor.parent.content.size
            ) {
              const language = resolveLanguage(fence[1]);
              const chain = editor.chain().deleteRange({ from: cursor.start(), to: cursor.end() });
              return (language ? chain.setCodeBlock({ language }) : chain.setCodeBlock()).run();
            }

            if (!event.shiftKey) {
              if (options.isSuggestionOpen()) return false;
              options.send();
              return true;
            }

            const { $from, empty } = editor.state.selection;

            if ($from.parent.type.name === 'codeBlock') {
              const atEnd = empty && $from.parentOffset === $from.parent.content.size;
              if (atEnd && $from.parent.textContent.endsWith('\n\n')) {
                return editor
                  .chain()
                  .command(({ tr }) => {
                    tr.delete($from.pos - 2, $from.pos);
                    return true;
                  })
                  .exitCode()
                  .run();
              }
              return editor.commands.insertContent('\n');
            }

            if (editor.isActive('listItem')) {
              return editor.commands.first(({ commands }) => [
                () => commands.splitListItem('listItem'),
                () => commands.liftListItem('listItem'),
              ]);
            }

            return editor.commands.setHardBreak();
          },
        },
      }),
    ];
  },
});
