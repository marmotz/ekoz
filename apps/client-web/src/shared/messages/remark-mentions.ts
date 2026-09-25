import type { MentionTarget } from '@ekozhq/sdk';

import { splitOnTokens } from '@/shared/messages/mention-tokens';

/** The slice of the mdast tree the plugin touches. */
interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
  data?: { hName?: string; hProperties?: Record<string, unknown> };
}

export interface RemarkMentionsOptions {
  mentions: readonly MentionTarget[];
}

/** Element name the chips are rendered under (see `ALLOWED_ELEMENTS`). */
export const MENTION_ELEMENT = 'mention';
/** Property carrying the index of the target in the message's `mentions`. */
export const MENTION_INDEX_PROPERTY = 'dataMentionIndex';

function transform(node: MdNode, mentions: readonly MentionTarget[]): void {
  if (!node.children) return;

  const next: MdNode[] = [];
  for (const child of node.children) {
    // Tokens in code stay literal.
    if (child.type === 'inlineCode' || child.type === 'code') {
      next.push(child);
      continue;
    }
    if (child.type !== 'text' || child.value === undefined) {
      transform(child, mentions);
      next.push(child);
      continue;
    }

    const pieces = splitOnTokens(child.value, mentions);
    if (!pieces) {
      next.push(child);
      continue;
    }
    for (const piece of pieces) {
      if ('text' in piece) {
        next.push({ type: 'text', value: piece.text });
      } else {
        next.push({
          type: 'mention',
          data: {
            hName: MENTION_ELEMENT,
            hProperties: { [MENTION_INDEX_PROPERTY]: piece.mention },
          },
          children: [{ type: 'text', value: mentions[piece.mention]?.token ?? '' }],
        });
      }
    }
  }
  node.children = next;
}

/**
 * Remark plugin turning the tokens of a message's `mentions` into `mention` nodes
 * (web-client-mentions technical design C2). Never touches `inlineCode` / `code`.
 */
export function remarkMentions(options: RemarkMentionsOptions) {
  return (tree: MdNode) => transform(tree, options.mentions);
}
