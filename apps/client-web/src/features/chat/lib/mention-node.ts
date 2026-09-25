import type { MentionInput, MentionTarget } from '@ekozhq/sdk';
import Mention from '@tiptap/extension-mention';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { mergeAttributes } from '@tiptap/react';

import { MENTION_CHIP_CLASS, MENTION_KIND_CLASSES } from '@/shared/messages/mention-style';

/** The five room roles a message can mention (`@<role>`). */
export const MENTION_ROLES = [
  'space_admin',
  'room_admin',
  'moderator',
  'member',
  'reader',
] as const;

export type MentionRoleName = (typeof MENTION_ROLES)[number];

/** A target as the composer holds it: the wire `MentionTarget` plus what the chip shows. */
export interface ComposerMention extends MentionTarget {
  label: string;
}

/**
 * The token the server will freeze for a target (technical design §2): `@identifier`,
 * `@all`, `@<role>` or `@<groupName>`.
 */
export function tokenFor(
  target:
    | { type: 'user'; identifier: string }
    | { type: 'all' }
    | { type: 'role' | 'group'; name: string },
): string {
  switch (target.type) {
    case 'user':
      return `@${target.identifier}`;
    case 'all':
      return '@all';
    default:
      return `@${target.name}`;
  }
}

/** What `POST /rooms/:id/messages` and `PATCH` take for a list of resolved targets. */
export function toMentionInputs(mentions: readonly MentionTarget[]): MentionInput[] {
  const inputs: MentionInput[] = [];
  for (const mention of mentions) {
    switch (mention.type) {
      case 'user':
        if (mention.target) inputs.push({ type: 'user', userId: mention.target });
        break;
      case 'all':
        inputs.push({ type: 'all' });
        break;
      case 'role':
        if (mention.target) inputs.push({ type: 'role', role: mention.target as MentionRoleName });
        break;
      case 'group':
        if (mention.target) inputs.push({ type: 'group', groupId: mention.target });
        break;
    }
  }
  return inputs;
}

/** Same target twice (two nodes for one person) counts once. */
export function dedupeMentions<T extends Pick<MentionTarget, 'type' | 'target'>>(
  mentions: readonly T[],
): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const mention of mentions) {
    const key = `${mention.type}:${mention.target ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(mention);
  }
  return result;
}

const attribute = (name: string, dataName: string, fallback: string | null) => ({
  default: fallback,
  parseHTML: (element: HTMLElement) => element.getAttribute(dataName) ?? fallback,
  renderHTML: (attributes: Record<string, unknown>) => {
    const value = attributes[name];
    return typeof value === 'string' && value !== '' ? { [dataName]: value } : {};
  },
});

/**
 * The mention node of the composer (technical design C1): an atomic inline node
 * `{ type, target, token, label }` shown as a coloured chip `@label` and serialised
 * to Markdown as its `token`. It reuses `@tiptap/extension-mention` for the `@`
 * suggestion plumbing.
 */
export const MentionNode = Mention.extend({
  addAttributes() {
    return {
      type: attribute('type', 'data-mention-type', 'user'),
      target: attribute('target', 'data-mention-target', null),
      token: attribute('token', 'data-mention-token', ''),
      label: attribute('label', 'data-mention-label', ''),
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="mention"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const kind = node.attrs.type as keyof typeof MENTION_KIND_CLASSES;
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'mention',
        class: `${MENTION_CHIP_CLASS} ${MENTION_KIND_CLASSES[kind] ?? MENTION_KIND_CLASSES.user}`,
      }),
      `@${node.attrs.label}`,
    ];
  },

  renderText({ node }) {
    return node.attrs.token as string;
  },

  // The body carries the token, not Mention's own `[@ id=...]` syntax.
  renderMarkdown(node: { attrs?: Record<string, unknown> }) {
    return String(node.attrs?.token ?? '');
  },
  parseMarkdown: undefined,
  markdownTokenizer: undefined,
});

/** The mention nodes of a document, as the targets a message is sent with. */
export function mentionsOfDoc(doc: ProseMirrorNode): ComposerMention[] {
  const mentions: ComposerMention[] = [];
  doc.descendants((node) => {
    if (node.type.name !== 'mention') return;
    mentions.push({
      type: node.attrs.type as MentionTarget['type'],
      target: (node.attrs.target as string | null) ?? null,
      token: String(node.attrs.token ?? ''),
      label: String(node.attrs.label ?? ''),
    });
  });
  return dedupeMentions(mentions);
}
