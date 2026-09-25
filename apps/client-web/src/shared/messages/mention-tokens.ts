import type { MentionTarget } from '@ekozhq/sdk';

/** A piece of text: plain, or the mention (index into the `mentions` list) whose token it is. */
export type TokenPiece = { text: string } | { mention: number };

const TOKEN_BOUNDARY = /[a-z0-9_./-]/;

/**
 * Splits `text` on the exact tokens of `mentions`: longest token first, and the
 * character after a token must not continue a name (`[a-z0-9_.-/]`), so `@al` never
 * matches inside `@alice`. Returns the pieces in order, or `null` when nothing matched.
 */
export function splitOnTokens(
  text: string,
  mentions: readonly Pick<MentionTarget, 'token'>[],
): TokenPiece[] | null {
  const candidates: { token: string; index: number }[] = [];
  const seen = new Set<string>();
  mentions.forEach((mention, index) => {
    if (mention.token === '' || seen.has(mention.token)) return;
    seen.add(mention.token);
    candidates.push({ token: mention.token, index });
  });
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.token.length - a.token.length);

  const pieces: TokenPiece[] = [];
  let plainStart = 0;
  let cursor = 0;
  while (cursor < text.length) {
    const found = candidates.find(
      ({ token }) =>
        text.startsWith(token, cursor) && !TOKEN_BOUNDARY.test(text[cursor + token.length] ?? ''),
    );
    if (!found) {
      cursor += 1;
      continue;
    }
    if (cursor > plainStart) pieces.push({ text: text.slice(plainStart, cursor) });
    pieces.push({ mention: found.index });
    cursor += found.token.length;
    plainStart = cursor;
  }

  if (pieces.length === 0) return null;
  if (plainStart < text.length) pieces.push({ text: text.slice(plainStart) });
  return pieces;
}
