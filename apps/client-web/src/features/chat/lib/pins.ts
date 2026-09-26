import type { MessagePin } from '@ekozhq/sdk';

/** The pins the room shows: the ones whose message is not hidden or deleted (the list is newest first). */
export function visiblePins(pins: readonly MessagePin[] | undefined): MessagePin[] {
  return (pins ?? []).filter(
    (pin) => (pin.message.hiddenAt ?? null) === null && (pin.message.redactedAt ?? null) === null,
  );
}

/**
 * The first line of a message body, for a one-line preview: a fence line (```` ``` ````)
 * is skipped, and an ellipsis marks that more follows.
 */
export function firstLinePreview(body: string): string {
  const lines = body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !/^(```|~~~)/.test(line));
  const [first = ''] = lines;
  return lines.length > 1 ? `${first}...` : first;
}
