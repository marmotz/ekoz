import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';

import { ComposerCodeBlock } from '@/features/chat/lib/code-block';
import type { ComposerHandlers } from '@/features/chat/lib/composer-handlers';
import { ComposerLink } from '@/features/chat/lib/composer-link';
import { ComposerShortcuts } from '@/features/chat/lib/composer-shortcuts';
import { MentionNode } from '@/features/chat/lib/mention-node';
import { SendOnEnter } from '@/features/chat/lib/send-on-enter';

/**
 * Marks whose own paste rules would turn pasted `**text**` into formatting. A plain
 * paste stays literal text: only the formatting of pasted HTML is kept.
 */
const NO_PASTE_RULES = new Set(['bold', 'italic', 'strike', 'code']);

const ComposerStarterKit = StarterKit.extend({
  addExtensions() {
    return (this.parent?.() ?? []).map((extension) =>
      NO_PASTE_RULES.has(extension.name)
        ? extension.extend({ addPasteRules: () => [] })
        : extension,
    );
  },
});

type MentionOptions = Parameters<typeof MentionNode.configure>[0];

export interface ComposerExtensionsOptions {
  handlers: ComposerHandlers;
  suggestion: NonNullable<MentionOptions>['suggestion'];
}

/**
 * The extension list shared by the send composer and the edit composer
 * (web-client-composer-formatting technical design C1). The schema can only produce
 * what the server accepts: no heading, rule, underline, image, table nor colour, so
 * `# ` and `---` stay literal text. Markdown input rules stay on for what is kept.
 * `handlers` forward to the callbacks of the component (see `createComposerHandlers`).
 */
export function buildComposerExtensions({ suggestion, handlers }: ComposerExtensionsOptions) {
  return [
    ComposerStarterKit.configure({
      heading: false,
      horizontalRule: false,
      underline: false,
      codeBlock: false,
      link: false,
    }),
    ComposerCodeBlock,
    ComposerLink,
    Markdown,
    MentionNode.configure({ suggestion }),
    SendOnEnter.configure({ send: handlers.send, isSuggestionOpen: handlers.isSuggestionOpen }),
    ComposerShortcuts.configure({ onLink: handlers.openLink }),
  ];
}
