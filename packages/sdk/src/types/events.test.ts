import { describe, expect, it } from 'vitest';
import type { RoomEvent } from './events.js';

function describeEvent(event: RoomEvent): string {
  switch (event.type) {
    case 'message_created':
      return `created:${event.content.body}`;
    case 'message_edited':
      return `edited:${event.content.editedAt}`;
    case 'message_deleted':
      return `deleted:${event.content.messageSeq}:${event.content.reason}`;
    case 'message_redacted':
      return `redacted:${event.content.reason}`;
    default:
      return `other:${event.type}`;
  }
}

const base = { roomId: 'r1', seq: '1', senderId: 'u1', createdAt: '2026-01-01T00:00:00.000Z' };

describe('RoomEvent', () => {
  it('narrows content on the typed variants', () => {
    expect(
      describeEvent({
        ...base,
        type: 'message_created',
        content: { messageId: 'm', body: 'hi', replyToId: null, mentions: [] },
      }),
    ).toBe('created:hi');
    expect(
      describeEvent({
        ...base,
        type: 'message_deleted',
        content: { messageId: 'm', messageSeq: '9', reason: 'user' },
      }),
    ).toBe('deleted:9:user');
    expect(
      describeEvent({ ...base, type: 'message_redacted', content: { reason: 'retention' } }),
    ).toBe('redacted:retention');
  });

  it('keeps unknown-content events on the fallback variant', () => {
    expect(describeEvent({ ...base, type: 'room_updated', content: { name: 'x' } })).toBe(
      'other:room_updated',
    );
  });
});
