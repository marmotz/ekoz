import type { Message, RoomEvent } from '@ekozhq/sdk';
import { describe, expect, it } from 'vitest';

import {
  addPending,
  applyRoomEvent,
  compareSeq,
  markPendingFailed,
  markPendingSending,
  mergeFirstPage,
  prependOlder,
  reconcilePending,
  replaceMessage,
  type Timeline,
  type TimelineMessage,
  toTimelineMessage,
} from '@/features/chat/lib/timeline';

function wireMessage(seq: number, overrides: Partial<Message> = {}): Message {
  return {
    id: `m${seq}`,
    roomId: 'r1',
    seq: String(seq),
    authorId: 'u1',
    body: `body ${seq}`,
    replyToId: null,
    mentions: [],
    editedAt: null,
    redactedAt: null,
    hiddenAt: null,
    createdAt: '2026-01-01T00:00:00.000Z' as unknown as Date,
    ...overrides,
  };
}

function message(seq: number, overrides: Partial<TimelineMessage> = {}): TimelineMessage {
  return toTimelineMessage(wireMessage(seq, overrides as Partial<Message>));
}

function timeline(seqs: number[], lastSeq = String(Math.max(0, ...seqs))): Timeline {
  return {
    messages: seqs.map((seq) => message(seq)),
    hasMoreOlder: false,
    lastSeq,
    pending: [],
  };
}

function created(seq: number, id = `m${seq}`, senderId: string | null = 'u2'): RoomEvent {
  return {
    type: 'message_created',
    roomId: 'r1',
    seq: String(seq),
    senderId,
    createdAt: '2026-01-02T00:00:00.000Z',
    content: { messageId: id, body: `live ${seq}`, replyToId: null, mentions: [] },
  };
}

describe('toTimelineMessage', () => {
  it('normalises Date instances to ISO strings', () => {
    const converted = toTimelineMessage(
      wireMessage(1, {
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        editedAt: new Date('2026-01-01T01:00:00.000Z'),
      }),
    );

    expect(converted.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(converted.editedAt).toBe('2026-01-01T01:00:00.000Z');
    expect(converted.redactedAt).toBeNull();
  });
});

describe('compareSeq', () => {
  it('compares decimal strings numerically, beyond the safe integer range', () => {
    expect(compareSeq('9', '10')).toBe(-1);
    expect(compareSeq('9007199254740993', '9007199254740992')).toBe(1);
    expect(compareSeq('5', '5')).toBe(0);
  });
});

describe('mergeFirstPage', () => {
  it('seeds messages, paging state and lastSeq', () => {
    const result = mergeFirstPage({
      items: [wireMessage(1), wireMessage(2)],
      lastSeq: '7',
      hasMore: true,
    });

    expect(result.messages.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(result.hasMoreOlder).toBe(true);
    expect(result.lastSeq).toBe('7');
    expect(result.pending).toEqual([]);
  });
});

describe('prependOlder', () => {
  it('puts the older page first and updates hasMoreOlder', () => {
    const result = prependOlder(timeline([3, 4]), {
      items: [wireMessage(1), wireMessage(2)],
      lastSeq: '4',
      hasMore: false,
    });

    expect(result.messages.map((m) => m.seq)).toEqual(['1', '2', '3', '4']);
    expect(result.hasMoreOlder).toBe(false);
    expect(result.lastSeq).toBe('4');
  });

  it('ignores messages already loaded', () => {
    const result = prependOlder(timeline([2, 3]), {
      items: [wireMessage(1), wireMessage(2)],
      lastSeq: '3',
      hasMore: true,
    });

    expect(result.messages.map((m) => m.seq)).toEqual(['1', '2', '3']);
    expect(result.hasMoreOlder).toBe(true);
  });
});

describe('applyRoomEvent', () => {
  it('appends a new message built from the event', () => {
    const { timeline: next, refetch } = applyRoomEvent(timeline([1, 2]), created(3));

    expect(refetch).toEqual([]);
    expect(next.lastSeq).toBe('3');
    expect(next.messages.at(-1)).toMatchObject({
      id: 'm3',
      seq: '3',
      authorId: 'u2',
      body: 'live 3',
      editedAt: null,
      redactedAt: null,
      createdAt: '2026-01-02T00:00:00.000Z',
    });
  });

  it('is idempotent: an event at or below lastSeq changes nothing', () => {
    const base = timeline([1, 2]);

    expect(applyRoomEvent(base, created(2, 'other')).timeline).toBe(base);
    expect(applyRoomEvent(base, created(1, 'other')).timeline).toBe(base);
  });

  it('applying the same event twice gives the same timeline', () => {
    const once = applyRoomEvent(timeline([1]), created(2)).timeline;
    const twice = applyRoomEvent(once, created(2)).timeline;

    expect(twice).toBe(once);
  });

  it('skips a created message whose id is already there but still advances lastSeq', () => {
    const base = { ...timeline([1, 2]), lastSeq: '1' };

    const { timeline: next } = applyRoomEvent(base, created(3, 'm2'));

    expect(next.messages).toHaveLength(2);
    expect(next.lastSeq).toBe('3');
  });

  it('keeps ascending seq order when events arrive out of order after a gap', () => {
    const base = timeline([1, 5]);
    const withOlder = { ...base, lastSeq: '3' };

    const { timeline: next } = applyRoomEvent(withOlder, created(4));

    expect(next.messages.map((m) => m.seq)).toEqual(['1', '4', '5']);
  });

  it('asks for a refetch on an edit of a loaded message and does not touch the body itself', () => {
    const base = timeline([1, 2]);
    const edited: RoomEvent = {
      type: 'message_edited',
      roomId: 'r1',
      seq: '3',
      senderId: 'u1',
      createdAt: '2026-01-02T00:00:00.000Z',
      content: { messageId: 'm2', editedAt: '2026-01-02T00:00:00.000Z' },
    };

    const { timeline: next, refetch } = applyRoomEvent(base, edited);

    expect(refetch).toEqual(['m2']);
    expect(next.lastSeq).toBe('3');
    expect(next.messages).toBe(base.messages);
  });

  it('does not refetch an edit of a message that is not loaded', () => {
    const edited: RoomEvent = {
      type: 'message_edited',
      roomId: 'r1',
      seq: '9',
      senderId: 'u1',
      createdAt: '2026-01-02T00:00:00.000Z',
      content: { messageId: 'old', editedAt: '2026-01-02T00:00:00.000Z' },
    };

    expect(applyRoomEvent(timeline([1]), edited).refetch).toEqual([]);
  });

  it('turns a message_deleted into a tombstone keyed by messageSeq', () => {
    const deleted: RoomEvent = {
      type: 'message_deleted',
      roomId: 'r1',
      seq: '5',
      senderId: 'u1',
      createdAt: '2026-01-03T00:00:00.000Z',
      content: { messageId: 'm2', messageSeq: '2', reason: 'user' },
    };

    const { timeline: next } = applyRoomEvent(timeline([1, 2, 3], '4'), deleted);

    expect(next.messages[1]).toMatchObject({
      id: 'm2',
      body: '',
      redactedAt: '2026-01-03T00:00:00.000Z',
    });
    expect(next.messages[0]?.body).toBe('body 1');
    expect(next.lastSeq).toBe('5');
  });

  it('turns a message_redacted into a tombstone keyed by seq, even at or below lastSeq', () => {
    const redacted: RoomEvent = {
      type: 'message_redacted',
      roomId: 'r1',
      seq: '2',
      senderId: 'u1',
      createdAt: '2026-01-03T00:00:00.000Z',
      content: { reason: 'retention' },
    };

    const { timeline: next } = applyRoomEvent(timeline([1, 2, 3]), redacted);

    expect(next.messages[1]).toMatchObject({
      id: 'm2',
      body: '',
      redactedAt: '2026-01-03T00:00:00.000Z',
    });
    expect(next.lastSeq).toBe('3');
  });

  it('only advances lastSeq for other event types', () => {
    const base = timeline([1, 2]);
    const joined: RoomEvent = {
      type: 'member_joined',
      roomId: 'r1',
      seq: '3',
      senderId: 'u3',
      createdAt: '2026-01-03T00:00:00.000Z',
      content: { userId: 'u3' },
    };

    const { timeline: next, refetch } = applyRoomEvent(base, joined);

    expect(refetch).toEqual([]);
    expect(next.lastSeq).toBe('3');
    expect(next.messages).toBe(base.messages);
  });
});

describe('replaceMessage', () => {
  it('replaces the message with the same id in place', () => {
    const fresh = message(2, { body: 'edited body', editedAt: '2026-01-04T00:00:00.000Z' });

    const next = replaceMessage(timeline([1, 2, 3]), fresh);

    expect(next.messages.map((m) => m.body)).toEqual(['body 1', 'edited body', 'body 3']);
  });

  it('ignores a message that is not in the timeline', () => {
    const base = timeline([1]);

    expect(replaceMessage(base, message(9))).toBe(base);
  });
});

describe('pending messages', () => {
  const pending = { localId: 'l1', body: 'hi', state: 'sending' as const };

  it('adds, fails and retries an entry', () => {
    const added = addPending(timeline([1]), pending);
    expect(added.pending).toEqual([pending]);

    const failed = markPendingFailed(added, 'l1', 'read_only');
    expect(failed.pending[0]).toEqual({ ...pending, state: 'failed', reason: 'read_only' });

    const retried = markPendingSending(failed, 'l1');
    expect(retried.pending[0]).toEqual(pending);
  });

  it('reconcile removes the entry and inserts the confirmed message', () => {
    const base = addPending(timeline([1]), pending);

    const next = reconcilePending(base, 'l1', message(2));

    expect(next.pending).toEqual([]);
    expect(next.messages.map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  it('reconcile is idempotent with a message the stream already delivered', () => {
    const base = addPending(timeline([1, 2]), pending);

    const next = reconcilePending(base, 'l1', message(2));

    expect(next.pending).toEqual([]);
    expect(next.messages.map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  it('leaves the other pending entries alone', () => {
    const other = { localId: 'l2', body: 'yo', state: 'sending' as const };
    const base = addPending(addPending(timeline([1]), pending), other);

    expect(reconcilePending(base, 'l1', message(2)).pending).toEqual([other]);
  });
});
