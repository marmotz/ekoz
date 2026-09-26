import { compareSeq, type TimelineMessage } from '@/features/chat/lib/timeline';

/** A member's read marker: `seq` is the highest room `seq` they have read. */
export interface ReadMarker {
  userId: string;
  seq: string;
}

/**
 * Where each other member's read marker is drawn (web-client-read-state technical
 * design C4). Pure: no React, no SDK calls.
 *
 * A reader is attached to the newest visible message whose `seq` is at or below their
 * marker. The caller's own marker, markers of people who are no longer current members
 * (the server keeps their rows) and markers older than the oldest loaded message are
 * not drawn. Returns `messageSeq -> userIds`, in marker order.
 */
export function readersBySeq(
  messages: readonly TimelineMessage[],
  markers: readonly ReadMarker[],
  memberIds: ReadonlySet<string>,
  meId: string,
): Map<string, string[]> {
  const visible = messages.filter((message) => message.hiddenAt === null);
  const readers = new Map<string, string[]>();

  for (const marker of markers) {
    if (marker.userId === meId || !memberIds.has(marker.userId)) continue;
    const message = newestAtOrBelow(visible, marker.seq);
    if (!message) continue;
    const list = readers.get(message.seq);
    if (list) list.push(marker.userId);
    else readers.set(message.seq, [marker.userId]);
  }

  return readers;
}

/** Binary search over messages sorted by ascending `seq`. */
function newestAtOrBelow(
  messages: readonly TimelineMessage[],
  seq: string,
): TimelineMessage | undefined {
  let low = 0;
  let high = messages.length - 1;
  let found: TimelineMessage | undefined;

  while (low <= high) {
    const middle = (low + high) >> 1;
    const candidate = messages[middle];
    if (!candidate) break;
    if (compareSeq(candidate.seq, seq) <= 0) {
      found = candidate;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return found;
}

/** Sets `userId`'s marker, keeping the higher `seq` (markers only move forward). */
export function upsertMarker(markers: readonly ReadMarker[], next: ReadMarker): ReadMarker[] {
  const current = markers.find((marker) => marker.userId === next.userId);
  if (!current) return [...markers, next];
  if (compareSeq(next.seq, current.seq) <= 0) return [...markers];
  return markers.map((marker) => (marker.userId === next.userId ? next : marker));
}
