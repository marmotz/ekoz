import { describe, expect, it } from 'vitest';

import { readersBySeq, upsertMarker } from '@/features/chat/lib/receipts';
import type { TimelineMessage } from '@/features/chat/lib/timeline';

function message(seq: number, overrides: Partial<TimelineMessage> = {}): TimelineMessage {
  return {
    id: `m${seq}`,
    roomId: 'r1',
    seq: String(seq),
    authorId: 'u1',
    body: `message ${seq}`,
    replyToId: null,
    mentions: [],
    mentionsMe: null,
    editedAt: null,
    redactedAt: null,
    hiddenAt: null,
    createdAt: '2026-01-01T10:00:00.000Z',
    reactions: [],
    attachments: [],
    linkPreview: null,
    ...overrides,
  };
}

const ME = 'me';
const members = new Set(['me', 'alice', 'bob', 'carol']);
const marker = (userId: string, seq: number) => ({ userId, seq: String(seq) });

describe('readersBySeq', () => {
  it('attaches a reader to the message their marker sits on', () => {
    const result = readersBySeq(
      [message(2), message(4), message(6)],
      [marker('alice', 4)],
      members,
      ME,
    );

    expect([...result]).toEqual([['4', ['alice']]]);
  });

  it('attaches a reader to the newest visible message at or below the marker', () => {
    // The marker points at a seq that holds no message (a reaction, a receipt, ...).
    const result = readersBySeq(
      [message(2), message(4), message(9)],
      [marker('alice', 7)],
      members,
      ME,
    );

    expect([...result]).toEqual([['4', ['alice']]]);
  });

  it('attaches a reader whose marker is past the newest message to the newest message', () => {
    const result = readersBySeq([message(2), message(4)], [marker('alice', 50)], members, ME);

    expect([...result]).toEqual([['4', ['alice']]]);
  });

  it('skips hidden messages', () => {
    const result = readersBySeq(
      [message(2), message(4, { hiddenAt: '2026-01-01T11:00:00.000Z' })],
      [marker('alice', 4)],
      members,
      ME,
    );

    expect([...result]).toEqual([['2', ['alice']]]);
  });

  it('keeps deleted messages, which still show as a tombstone', () => {
    const result = readersBySeq(
      [message(2), message(4, { redactedAt: '2026-01-01T11:00:00.000Z' })],
      [marker('alice', 4)],
      members,
      ME,
    );

    expect([...result]).toEqual([['4', ['alice']]]);
  });

  it('excludes the caller own marker', () => {
    const result = readersBySeq([message(2)], [marker(ME, 2), marker('alice', 2)], members, ME);

    expect([...result]).toEqual([['2', ['alice']]]);
  });

  it('excludes users who are no longer members', () => {
    const result = readersBySeq([message(2)], [marker('gone', 2), marker('alice', 2)], members, ME);

    expect([...result]).toEqual([['2', ['alice']]]);
  });

  it('does not draw a marker older than the oldest loaded message', () => {
    const result = readersBySeq([message(10), message(12)], [marker('alice', 4)], members, ME);

    expect(result.size).toBe(0);
  });

  it('groups several readers on one message and spreads the others', () => {
    const result = readersBySeq(
      [message(2), message(4), message(6)],
      [marker('alice', 6), marker('bob', 5), marker('carol', 3), marker('bob', 6)],
      members,
      ME,
    );

    expect(result.get('4')).toEqual(['bob']);
    expect(result.get('6')).toEqual(['alice', 'bob']);
    expect(result.get('2')).toEqual(['carol']);
  });

  it('compares seq numerically, beyond the safe integer range', () => {
    const big = (n: bigint) => String(9007199254740993n + n);
    const messages = [message(1, { seq: big(0n) }), message(2, { seq: big(2n) })];

    const result = readersBySeq(messages, [{ userId: 'alice', seq: big(1n) }], members, ME);

    expect([...result]).toEqual([[big(0n), ['alice']]]);
  });

  it('returns nothing without messages or markers', () => {
    expect(readersBySeq([], [marker('alice', 2)], members, ME).size).toBe(0);
    expect(readersBySeq([message(2)], [], members, ME).size).toBe(0);
  });
});

describe('upsertMarker', () => {
  it('adds a marker for a new user', () => {
    expect(upsertMarker([marker('alice', 2)], marker('bob', 3))).toEqual([
      marker('alice', 2),
      marker('bob', 3),
    ]);
  });

  it('moves a marker forward', () => {
    expect(upsertMarker([marker('alice', 2), marker('bob', 3)], marker('alice', 9))).toEqual([
      marker('alice', 9),
      marker('bob', 3),
    ]);
  });

  it('never moves a marker back', () => {
    expect(upsertMarker([marker('alice', 9)], marker('alice', 4))).toEqual([marker('alice', 9)]);
    expect(upsertMarker([marker('alice', 9)], marker('alice', 9))).toEqual([marker('alice', 9)]);
  });
});
