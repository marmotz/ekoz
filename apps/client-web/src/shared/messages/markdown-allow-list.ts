import { type ComponentProps, createElement } from 'react';
import type { Options } from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from '@/shared/messages/code-block';
import { CODE_LANGUAGES, PLAIN_TEXT_NAMES } from '@/shared/messages/code-languages';

/**
 * Markdown rendering rules for message bodies (web-client-chat technical design
 * 6.4): a fixed element allow-list, no raw HTML path, and the same link schemes
 * the server accepts.
 */

export const ALLOWED_ELEMENTS = [
  'p',
  'em',
  'strong',
  'del',
  'code',
  'pre',
  'blockquote',
  'ul',
  'ol',
  'li',
  'a',
  'br',
  'mention',
  // Emitted by the highlighter only: there is no raw-HTML path to smuggle one in.
  'span',
] as const;

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/** Keeps a URL only when it is absolute and uses an allowed scheme; anything else is dropped. */
export function transformUrl(url: string): string | null {
  try {
    return ALLOWED_PROTOCOLS.has(new URL(url).protocol) ? url : null;
  } catch {
    return null;
  }
}

function SafeLink({ node, ...props }: ComponentProps<'a'> & { node?: unknown }) {
  // `node` is the hast element react-markdown passes along; it must not reach the DOM.
  void node;
  return createElement('a', {
    ...props,
    target: '_blank',
    rel: 'noopener noreferrer nofollow',
  });
}

const highlightOptions = {
  // A fence without language is detected, among the known languages only.
  detect: true,
  languages: Object.fromEntries(CODE_LANGUAGES.map(({ id, grammar }) => [id, grammar])),
  aliases: Object.fromEntries(CODE_LANGUAGES.map(({ id, aliases }) => [id, [...aliases]])),
  subset: CODE_LANGUAGES.map(({ id }) => id),
  plainText: [...PLAIN_TEXT_NAMES],
};

export const markdownOptions: Options = {
  remarkPlugins: [remarkGfm],
  rehypePlugins: [[rehypeHighlight, highlightOptions]],
  skipHtml: true,
  allowedElements: [...ALLOWED_ELEMENTS],
  unwrapDisallowed: true,
  urlTransform: transformUrl,
  components: { a: SafeLink, pre: CodeBlock },
};
