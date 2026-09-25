import type { MentionTarget } from '@ekozhq/sdk';
import type { JSONContent } from '@tiptap/react';

import { splitOnTokens } from '@/shared/messages/mention-tokens';

/**
 * Turns every occurrence of one of the message's tokens, in a parsed body, into a
 * mention node again (edit round trip, technical design C1). Same matching rule as the
 * chips of a rendered message; code (marks and blocks) is left alone.
 */
export function injectMentionNodes(
  doc: JSONContent,
  mentions: readonly MentionTarget[],
  labelFor: (mention: MentionTarget) => string,
): JSONContent {
  const visit = (node: JSONContent): JSONContent[] => {
    if (node.type === 'codeBlock') return [node];

    if (node.type === 'text') {
      if (node.marks?.some((mark) => mark.type === 'code') || node.text === undefined) {
        return [node];
      }
      const pieces = splitOnTokens(node.text, mentions);
      if (!pieces) return [node];
      return pieces.flatMap((piece): JSONContent[] => {
        if ('text' in piece) return [{ ...node, text: piece.text }];
        const mention = mentions[piece.mention];
        if (!mention) return [];
        return [
          {
            type: 'mention',
            attrs: {
              type: mention.type,
              target: mention.target,
              token: mention.token,
              label: labelFor(mention),
            },
          },
        ];
      });
    }

    if (!node.content) return [node];
    return [{ ...node, content: node.content.flatMap(visit) }];
  };

  return visit(doc)[0] ?? doc;
}
