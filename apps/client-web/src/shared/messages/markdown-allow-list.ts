import { type ComponentProps, createElement } from 'react';
import type { Options } from 'react-markdown';
import remarkGfm from 'remark-gfm';

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

export const markdownOptions: Options = {
  remarkPlugins: [remarkGfm],
  skipHtml: true,
  allowedElements: [...ALLOWED_ELEMENTS],
  unwrapDisallowed: true,
  urlTransform: transformUrl,
  components: { a: SafeLink },
};
