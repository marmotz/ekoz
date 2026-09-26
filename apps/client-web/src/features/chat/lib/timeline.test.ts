import type { Message, RoomEvent } from '@ekozhq/sdk';
import { describe, expect, it } from 'vitest';

import {
  addPending,
  appendNewer,
  applyRoomEvent,
  compareSeq,
  markPendingFailed,
  markPendingSending,
  mergeFirstPage,
  prependOlder,
  reconcilePending,
  redactLocally,
  replaceMessage,
  type Timeline,
  type TimelineMessage,
  toggleReactionLocally,
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
    mentionsMe: null,
    reactions: [],
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
    hasMoreNewer: false,
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
  const pending = {
    localId: 'l1',
    body: 'hi',
    mentions: [],
    replyToId: null,
    state: 'sending' as const,
  };

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
    const other = {
      localId: 'l2',
      body: 'yo',
      mentions: [],
      replyToId: null,
      state: 'sending' as const,
    };
    const base = addPending(addPending(timeline([1]), pending), other);

    expect(reconcilePending(base, 'l1', message(2)).pending).toEqual([other]);
  });
});

describe('mentionsMe', () => {
  const viewer = { userId: 'me', role: 'moderator', groupIds: new Set(['g1']) };
  const withMentions = (mentions: unknown[]): RoomEvent => {
    const event = created(5);
    if (event.type !== 'message_created') throw new Error('unexpected');
    return { ...event, content: { ...event.content, mentions: mentions as never } };
  };

  it('carries the server value on REST pages', () => {
    const page = {
      items: [
        wireMessage(1, { mentionsMe: 'direct' }),
        wireMessage(2, { mentionsMe: 'collective' }),
        wireMessage(3),
      ],
      lastSeq: '3',
      hasMore: false,
    };

    expect(mergeFirstPage(page).messages.map((m) => m.mentionsMe)).toEqual([
      'direct',
      'collective',
      null,
    ]);
  });

  it('derives a direct mention for a live message', () => {
    const { timeline: next } = applyRoomEvent(
      timeline([1, 2, 3, 4]),
      withMentions([{ type: 'user', target: 'me', token: '@me' }]),
      viewer,
    );

    expect(next.messages.at(-1)?.mentionsMe).toBe('direct');
    expect(next.messages.at(-1)?.mentions).toHaveLength(1);
  });

  it('derives a collective mention for a live message', () => {
    const { timeline: next } = applyRoomEvent(
      timeline([1, 2, 3, 4]),
      withMentions([{ type: 'all', target: null, token: '@all' }]),
      viewer,
    );

    expect(next.messages.at(-1)?.mentionsMe).toBe('collective');
  });

  it('is null for a live message without a viewer or a matching target', () => {
    const noViewer = applyRoomEvent(timeline([1, 2, 3, 4]), withMentions([]));
    expect(noViewer.timeline.messages.at(-1)?.mentionsMe).toBeNull();

    const other = applyRoomEvent(
      timeline([1, 2, 3, 4]),
      withMentions([{ type: 'user', target: 'u9', token: '@u9' }]),
      viewer,
    );
    expect(other.timeline.messages.at(-1)?.mentionsMe).toBeNull();
  });
});

describe('detached timeline', () => {
  const detached = (seqs: number[], lastSeq = '90'): Timeline => ({
    ...timeline(seqs, lastSeq),
    hasMoreNewer: true,
  });

  it('is detached when the page says there are newer messages', () => {
    const result = mergeFirstPage({
      items: [wireMessage(40), wireMessage(41)],
      lastSeq: '90',
      hasMore: true,
      hasMoreNewer: true,
    });

    expect(result.hasMoreNewer).toBe(true);
    expect(result.hasMoreOlder).toBe(true);
  });

  it('appendNewer adds the page after the loaded messages, in order, without duplicates', () => {
    const result = appendNewer(detached([40, 41]), {
      items: [wireMessage(41), wireMessage(42), wireMessage(43)],
      lastSeq: '90',
      hasMore: false,
      hasMoreNewer: true,
    });

    expect(result.messages.map((m) => m.seq)).toEqual(['40', '41', '42', '43']);
    expect(result.hasMoreNewer).toBe(true);
  });

  it('appendNewer reattaches the timeline once the last page is loaded', () => {
    const result = appendNewer(detached([88, 89]), {
      items: [wireMessage(90), wireMessage(91)],
      lastSeq: '91',
      hasMore: false,
      hasMoreNewer: false,
    });

    expect(result.hasMoreNewer).toBe(false);
    expect(result.lastSeq).toBe('91');
    expect(result.messages.map((m) => m.seq)).toEqual(['88', '89', '90', '91']);
  });

  it('appendNewer never moves lastSeq back', () => {
    const result = appendNewer(detached([40], '90'), {
      items: [wireMessage(41)],
      lastSeq: '60',
      hasMore: false,
      hasMoreNewer: true,
    });

    expect(result.lastSeq).toBe('90');
  });

  it('does not insert a live message while detached', () => {
    const { timeline: next } = applyRoomEvent(detached([40, 41]), created(95));

    expect(next.messages.map((m) => m.seq)).toEqual(['40', '41']);
    expect(next.hasMoreNewer).toBe(true);
  });

  it('inserts live messages again once reattached', () => {
    const attached = appendNewer(detached([90]), {
      items: [wireMessage(91)],
      lastSeq: '91',
      hasMore: false,
      hasMoreNewer: false,
    });

    const { timeline: next } = applyRoomEvent(attached, created(92));

    expect(next.messages.map((m) => m.seq)).toEqual(['90', '91', '92']);
  });

  it('still applies deletions and edits to loaded messages while detached', () => {
    const deleted: RoomEvent = {
      type: 'message_deleted',
      roomId: 'r1',
      seq: '95',
      senderId: 'u1',
      createdAt: '2026-01-02T00:00:00.000Z',
      content: { messageId: 'm40', messageSeq: '40', reason: 'user' },
    };
    const edited: RoomEvent = {
      type: 'message_edited',
      roomId: 'r1',
      seq: '96',
      senderId: 'u1',
      createdAt: '2026-01-02T00:00:00.000Z',
      content: { messageId: 'm41', editedAt: '2026-01-02T00:00:00.000Z' },
    };

    const afterDelete = applyRoomEvent(detached([40, 41]), deleted);
    expect(afterDelete.timeline.messages[0]?.redactedAt).not.toBeNull();

    const afterEdit = applyRoomEvent(afterDelete.timeline, edited);
    expect(afterEdit.refetch).toEqual(['m41']);
  });

  it('does not insert a confirmed own message while detached, but clears the pending entry', () => {
    const base = addPending(detached([40]), {
      localId: 'l1',
      body: 'hi',
      mentions: [],
      replyToId: null,
      state: 'sending',
    });

    const next = reconcilePending(base, 'l1', message(95));

    expect(next.pending).toEqual([]);
    expect(next.messages.map((m) => m.seq)).toEqual(['40']);
  });
});

describe('reactions', () => {
  const reactionEvent = (
    type: 'reaction_added' | 'reaction_removed',
    seq: number,
    emoji: string,
    senderId: string | null = 'u2',
    messageId = 'm1',
  ): RoomEvent => ({
    type,
    roomId: 'r1',
    seq: String(seq),
    senderId,
    createdAt: '2026-01-02T00:00:00.000Z',
    content: { messageId, emoji },
  });

  const withReactions = (reactions: { emoji: string; userIds: string[] }[]): Timeline => ({
    ...timeline([1], '1'),
    messages: [message(1, { reactions })],
  });

  it('copies the reactions of a fetched message, and starts a live message with none', () => {
    const fetched = toTimelineMessage(
      wireMessage(1, { reactions: [{ emoji: '👍', userIds: ['u1', 'u2'] }] }),
    );

    expect(fetched.reactions).toEqual([{ emoji: '👍', userIds: ['u1', 'u2'] }]);
    expect(applyRoomEvent(timeline([1]), created(2)).timeline.messages[1]?.reactions).toEqual([]);
  });

  it('adds a reaction: a new entry at the end, then the actor to an existing entry', () => {
    const start = withReactions([{ emoji: '👍', userIds: ['u1'] }]);

    const first = applyRoomEvent(start, reactionEvent('reaction_added', 2, '🎉'));
    const second = applyRoomEvent(first.timeline, reactionEvent('reaction_added', 3, '👍'));

    expect(second.timeline.messages[0]?.reactions).toEqual([
      { emoji: '👍', userIds: ['u1', 'u2'] },
      { emoji: '🎉', userIds: ['u2'] },
    ]);
    expect(second.timeline.lastSeq).toBe('3');
  });

  it('removes the actor, and the entry once it is empty', () => {
    const start = withReactions([
      { emoji: '👍', userIds: ['u1', 'u2'] },
      { emoji: '🎉', userIds: ['u2'] },
    ]);

    const first = applyRoomEvent(start, reactionEvent('reaction_removed', 2, '👍'));
    const second = applyRoomEvent(first.timeline, reactionEvent('reaction_removed', 3, '🎉'));

    expect(second.timeline.messages[0]?.reactions).toEqual([{ emoji: '👍', userIds: ['u1'] }]);
  });

  it('is idempotent: a replayed add or remove changes nothing', () => {
    const start = withReactions([{ emoji: '👍', userIds: ['u2'] }]);

    const again = applyRoomEvent(start, reactionEvent('reaction_added', 2, '👍'));
    const absent = applyRoomEvent(start, reactionEvent('reaction_removed', 2, '🎉'));

    expect(again.timeline.messages).toBe(start.messages);
    expect(absent.timeline.messages).toBe(start.messages);
  });

  it('ignores an event at or below lastSeq, for an unknown message and for an unknown actor', () => {
    const start = withReactions([]);

    expect(applyRoomEvent(start, reactionEvent('reaction_added', 1, '👍')).timeline).toBe(start);
    expect(
      applyRoomEvent(start, reactionEvent('reaction_added', 2, '👍', 'u2', 'other')).timeline
        .messages,
    ).toBe(start.messages);
    expect(
      applyRoomEvent(start, reactionEvent('reaction_added', 2, '👍', null)).timeline.messages,
    ).toBe(start.messages);
  });

  it('clears the reactions of a deleted or redacted message', () => {
    const start = withReactions([{ emoji: '👍', userIds: ['u1'] }]);
    const deleted = applyRoomEvent(start, {
      type: 'message_deleted',
      roomId: 'r1',
      seq: '2',
      senderId: 'u1',
      createdAt: '2026-01-02T00:00:00.000Z',
      content: { messageId: 'm1', messageSeq: '1', reason: 'user' },
    } as RoomEvent);
    const redacted = applyRoomEvent(start, {
      type: 'message_redacted',
      roomId: 'r1',
      seq: '1',
      senderId: null,
      createdAt: '2026-01-02T00:00:00.000Z',
      content: { reason: 'retention' },
    } as RoomEvent);

    expect(deleted.timeline.messages[0]?.reactions).toEqual([]);
    expect(redacted.timeline.messages[0]?.reactions).toEqual([]);
  });

  it('does not add a reaction to a tombstone', () => {
    const start = redactLocally(withReactions([]), 'm1', '2026-01-02T00:00:00.000Z');

    const next = applyRoomEvent(start, reactionEvent('reaction_added', 2, '👍'));

    expect(next.timeline.messages[0]?.reactions).toEqual([]);
  });

  it('replaceMessage keeps the reactions of the message already in the timeline', () => {
    const start = withReactions([{ emoji: '👍', userIds: ['u1'] }]);
    const fetched = toTimelineMessage(
      wireMessage(1, { body: 'edited', reactions: [{ emoji: '🎉', userIds: ['u9'] }] }),
    );

    const next = replaceMessage(start, fetched);

    expect(next.messages[0]?.body).toBe('edited');
    expect(next.messages[0]?.reactions).toEqual([{ emoji: '👍', userIds: ['u1'] }]);
  });

  it('toggleReactionLocally adds and removes the caller, and stays idempotent with the echo', () => {
    const start = withReactions([]);

    const on = toggleReactionLocally(start, 'm1', '👍', 'me', true);
    const echo = applyRoomEvent(on, reactionEvent('reaction_added', 2, '👍', 'me'));
    const off = toggleReactionLocally(echo.timeline, 'm1', '👍', 'me', false);

    expect(on.messages[0]?.reactions).toEqual([{ emoji: '👍', userIds: ['me'] }]);
    expect(echo.timeline.messages).toBe(on.messages);
    expect(off.messages[0]?.reactions).toEqual([]);
    expect(toggleReactionLocally(start, 'unknown', '👍', 'me', true)).toBe(start);
  });
});

describe('redactLocally', () => {
  it('turns the message into a tombstone, idempotently with the deletion echo', () => {
    const start = timeline([1, 2], '2');

    const local = redactLocally(start, 'm1', '2026-01-02T00:00:00.000Z');
    const echo = applyRoomEvent(local, {
      type: 'message_deleted',
      roomId: 'r1',
      seq: '3',
      senderId: 'u1',
      createdAt: '2026-01-03T00:00:00.000Z',
      content: { messageId: 'm1', messageSeq: '1', reason: 'user' },
    } as RoomEvent);

    expect(local.messages[0]).toMatchObject({
      body: '',
      redactedAt: '2026-01-02T00:00:00.000Z',
      reactions: [],
    });
    expect(local.messages[1]).toBe(start.messages[1]);
    expect(echo.timeline.messages[0]?.redactedAt).toBe('2026-01-02T00:00:00.000Z');
  });
});
