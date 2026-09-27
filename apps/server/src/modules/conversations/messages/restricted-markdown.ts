import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import { visit } from 'unist-util-visit';

/**
 * Restricted-Markdown validation (technical.md §11, issue #7): a `remark`
 * pipeline with a node-type allowlist. Allowed constructs: emphasis, strong,
 * strikethrough, inline/fenced code, blockquote, ordered/unordered lists,
 * `http(s)`/`mailto` links, hard/soft breaks. Disallowed: raw HTML, images,
 * headings, tables (first increment).
 *
 * `remark-gfm` is needed for strikethrough; it also parses tables and
 * autolinked bare URLs as ordinary `link` nodes. Tables are rejected below by
 * node type; a bare-URL autolink is allowed through like any other `link` —
 * distinguishing "typed `[]()`" from "autolinked" at the mdast level isn't
 * possible, and both are equally safe once the `http(s)`/`mailto` scheme
 * check passes, so the stricter "no autolinking" rule is not enforced.
 */
const ALLOWED_NODE_TYPES = new Set([
  'root',
  'paragraph',
  'text',
  'emphasis',
  'strong',
  'delete',
  'inlineCode',
  'code',
  'blockquote',
  'list',
  'listItem',
  'link',
  'break',
]);

const processor = remark().use(remarkGfm);

export class RestrictedMarkdownError extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

/** Throws {@link RestrictedMarkdownError} if `source` uses a disallowed construct. */
export function validateRestrictedMarkdown(source: string): void {
  const tree = processor.parse(source);

  visit(tree, (node) => {
    if (!ALLOWED_NODE_TYPES.has(node.type)) {
      throw new RestrictedMarkdownError(`Disallowed Markdown construct: "${node.type}".`);
    }
    if (node.type === 'link') {
      const url = (node as { url: string }).url;
      if (!/^(https?:|mailto:)/i.test(url)) {
        throw new RestrictedMarkdownError('Links must use http(s) or mailto.');
      }
    }
  });
}

/** Every `http(s)` link in `source`'s Markdown, in document order (technical.md §S10). */
export function extractHttpLinks(source: string): string[] {
  const tree = processor.parse(source);
  const urls: string[] = [];

  visit(tree, (node) => {
    if (node.type === 'link') {
      const url = (node as { url: string }).url;
      if (/^https?:/i.test(url)) {
        urls.push(url);
      }
    }
  });

  return urls;
}
