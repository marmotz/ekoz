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
    case 'receipt_updated':
      return `receipt:${event.content.userId}:${event.content.seq}`;
    case 'reaction_added':
      return `reaction+:${event.content.messageId}:${event.content.emoji}:${event.senderId}`;
    case 'reaction_removed':
      return `reaction-:${event.content.messageId}:${event.content.emoji}`;
    case 'pin_added':
      return `pin+:${event.content.messageId}`;
    case 'pin_removed':
      return `pin-:${event.content.messageId}`;
    case 'group_changed':
      return `group:${event.content.change}:${event.content.name}:${event.content.userId ?? '-'}`;
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
        content: {
          messageId: 'm',
          body: 'hi',
          replyToId: null,
          mentions: [],
          attachments: [],
          linkPreview: null,
        },
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

  it('narrows content on the reaction and pin events', () => {
    expect(
      describeEvent({
        ...base,
        type: 'reaction_added',
        content: { messageId: 'm', emoji: '👍' },
      }),
    ).toBe('reaction+:m:👍:u1');
    expect(
      describeEvent({
        ...base,
        type: 'reaction_removed',
        content: { messageId: 'm', emoji: '👍' },
      }),
    ).toBe('reaction-:m:👍');
    expect(describeEvent({ ...base, type: 'pin_added', content: { messageId: 'm' } })).toBe(
      'pin+:m',
    );
    expect(describeEvent({ ...base, type: 'pin_removed', content: { messageId: 'm' } })).toBe(
      'pin-:m',
    );
  });

  it('types the mention targets of a created message', () => {
    const event: RoomEvent = {
      ...base,
      type: 'message_created',
      content: {
        messageId: 'm',
        body: 'hi @all',
        replyToId: null,
        mentions: [
          { type: 'all', target: null, token: '@all' },
          { type: 'user', target: 'u2', token: '@bob/example.com' },
        ],
        attachments: [],
        linkPreview: null,
      },
    };

    expect(event.type === 'message_created' && event.content.mentions.map((m) => m.token)).toEqual([
      '@all',
      '@bob/example.com',
    ]);
  });

  it('narrows receipt_updated content', () => {
    expect(
      describeEvent({
        ...base,
        type: 'receipt_updated',
        content: { userId: 'u2', seq: '17' },
      }),
    ).toBe('receipt:u2:17');
  });

  it('narrows group_changed content', () => {
    expect(
      describeEvent({
        ...base,
        type: 'group_changed',
        content: { groupId: 'g', change: 'member_added', name: 'devs', userId: 'u2' },
      }),
    ).toBe('group:member_added:devs:u2');
    expect(
      describeEvent({
        ...base,
        type: 'group_changed',
        content: { groupId: 'g', change: 'created', name: 'devs' },
      }),
    ).toBe('group:created:devs:-');
  });

  it('keeps unknown-content events on the fallback variant', () => {
    expect(describeEvent({ ...base, type: 'room_updated', content: { name: 'x' } })).toBe(
      'other:room_updated',
    );
  });
});
