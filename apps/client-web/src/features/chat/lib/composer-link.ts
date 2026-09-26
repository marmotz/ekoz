import { Link } from '@tiptap/extension-link';

import { transformUrl } from '@/shared/messages/markdown-allow-list';

/**
 * The composer link mark (web-client-composer-formatting technical design C3).
 * Only the schemes the server and the renderer accept (`transformUrl`) can become
 * a link, so composer and timeline cannot drift. A bare URL is linkified as it is
 * typed or pasted, and pasting a URL over a selection links the selection.
 */
export const ComposerLink = Link.configure({
  openOnClick: false,
  autolink: true,
  linkOnPaste: true,
  defaultProtocol: 'https',
  isAllowedUri: (url, ctx) => ctx.defaultValidate(url) && transformUrl(url) !== null,
});

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * The absolute URL a user's input stands for: a scheme-less input gets `https://`.
 * `null` when it is empty, unparsable or uses a scheme other than http(s) and mailto.
 */
export function normaliseLinkUrl(input: string): string | null {
  const value = input.trim();
  if (value === '') return null;
  return transformUrl(HAS_SCHEME.test(value) ? value : `https://${value}`);
}
