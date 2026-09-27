/**
 * `http(s)` links found in a message body, in order of first appearance,
 * deduplicated. The composer's editor autolinks a bare URL as it is typed, so
 * the Markdown body carries it as `[text](href)`: markdown links are matched
 * first, then whatever bare `http(s)` URL is left in the remaining text.
 */
const MARKDOWN_LINK_PATTERN = /\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/g;
const BARE_URL_PATTERN = /https?:\/\/[^\s<>"')\]]+/g;

/** Trailing punctuation that is prose, not part of the URL. */
function trimTrailingPunctuation(url: string): string {
  return url.replace(/[.,;:!?)]+$/, '');
}

export function extractLinks(body: string): string[] {
  const seen = new Set<string>();
  const links: string[] = [];
  const push = (raw: string) => {
    const url = trimTrailingPunctuation(raw);
    if (url !== '' && !seen.has(url)) {
      seen.add(url);
      links.push(url);
    }
  };

  const withoutMarkdownLinks = body.replace(MARKDOWN_LINK_PATTERN, (_full, href: string) => {
    push(href);
    return '';
  });

  for (const match of withoutMarkdownLinks.match(BARE_URL_PATTERN) ?? []) {
    push(match);
  }

  return links;
}
