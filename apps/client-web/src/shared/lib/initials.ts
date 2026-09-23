/** Up to two initials of a display name, `?` when there is none to read. */
export function initials(name: string | null | undefined): string {
  const letters = (name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => Array.from(word)[0]?.toUpperCase() ?? '');

  return letters.join('') || '?';
}
