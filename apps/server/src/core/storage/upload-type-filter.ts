/**
 * Match `type` against a filter list entry: an exact MIME type
 * (`application/zip`) or a family wildcard (`video/*`) (technical.md §S5).
 */
function matchesEntry(type: string, entry: string): boolean {
  if (entry.endsWith('/*')) {
    return type.startsWith(entry.slice(0, -1));
  }

  return type === entry;
}

/**
 * Whether `type` is accepted by `uploads.filter_mode` / `uploads.filter_types`
 * (technical.md §S5). `blocklist`: accepted unless matched. `allowlist`:
 * accepted only if matched.
 */
export function isTypeAllowed(
  type: string,
  mode: 'blocklist' | 'allowlist',
  types: readonly string[],
): boolean {
  const matched = types.some((entry) => matchesEntry(type, entry));

  return mode === 'allowlist' ? matched : !matched;
}
