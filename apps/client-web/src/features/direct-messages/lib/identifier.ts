/**
 * Whether `input` has the `name/server` identifier shape. An email address (an `@`) never
 * does: `GET /users/:identifier` also resolves emails, and the client must not send one.
 */
export function isIdentifierShape(input: string): boolean {
  return /^[^\s@/]+\/[^\s@/]+$/.test(input);
}
