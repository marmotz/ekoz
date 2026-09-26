import { CodeBlock } from '@tiptap/extension-code-block';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { textblockTypeInputRule } from '@tiptap/react';

import { resolveLanguage } from '@/shared/messages/code-languages';

/** ```` ```ts ```` and `~~~ts`, the language being any run of non-blank characters (`c++`, `c#`). */
const BACKTICK_INPUT = /^```([^\s`]+)?[\s\n]$/;
const TILDE_INPUT = /^~~~([^\s~]+)?[\s\n]$/;

/**
 * The composer code block (web-client-composer-formatting technical design C4). Its
 * `language` is always normalised with `resolveLanguage`: an alias becomes its id, a
 * known id is kept, any other value becomes `text`, nothing stays `null` (auto-detect
 * in the timeline). Normalisation happens on the ```` ```lang ```` input rule, on a
 * pasted block and when a body is loaded.
 *
 * `exitOnTripleEnter` is off: that exit is bound to `Enter`, which sends. The composer
 * exits a block with three `Shift+Enter` instead (see `send-on-enter.ts`).
 */
export const ComposerCodeBlock = CodeBlock.extend({
  addAttributes() {
    return {
      language: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const prefix = this.options.languageClassPrefix;
          if (!prefix) return null;
          const declared = [...(element.firstElementChild?.classList ?? [])]
            .find((name) => name.startsWith(prefix))
            ?.slice(prefix.length);
          return resolveLanguage(declared);
        },
        rendered: false,
      },
    };
  },

  parseMarkdown: (token, helpers) => {
    if (
      token.raw?.startsWith('```') === false &&
      token.raw?.startsWith('~~~') === false &&
      token.codeBlockStyle !== 'indented'
    ) {
      return [];
    }

    return helpers.createNode(
      'codeBlock',
      { language: resolveLanguage(token.lang) },
      token.text ? [helpers.createTextNode(token.text)] : [],
    );
  },

  addInputRules() {
    return [BACKTICK_INPUT, TILDE_INPUT].map((find) =>
      textblockTypeInputRule({
        find,
        type: this.type,
        getAttributes: (match) => ({ language: resolveLanguage(match[1]) }),
      }),
    );
  },

  addProseMirrorPlugins() {
    return [
      ...(this.parent?.() ?? []),
      // A pasted block (VS Code hands its own mode over) is normalised once pasted. Not on
      // every transaction: that would close the undo window of the input rule.
      new Plugin({
        key: new PluginKey('composerCodeBlockLanguage'),
        appendTransaction: (transactions, _old, state) => {
          if (!transactions.some((transaction) => transaction.getMeta('paste'))) return null;
          const tr = state.tr;
          state.doc.descendants((node, pos) => {
            if (node.type.name !== 'codeBlock') return;
            const language = resolveLanguage(node.attrs.language as string | null);
            if (language !== node.attrs.language) {
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, language });
            }
          });
          return tr.docChanged ? tr : null;
        },
      }),
    ];
  },
}).configure({ exitOnTripleEnter: false });
