import type { MentionTarget, Message, RoomEvent } from '@ekozhq/sdk';

import {
  deriveMentionsMe,
  type MentionsMe,
  type MentionViewer,
  parseMentionsMe,
} from '@/shared/mentions/mentions-me';

/**
 * Pure timeline state of one room and the only place room events are interpreted
 * (web-client-chat technical design 6.1). No React, no SDK calls.
 */

/**
 * A message as the timeline holds it. The generated `Message` types timestamps as
 * `Date` while the wire carries ISO strings (technical design F9), so the timeline
 * normalises them to strings and never relies on `Date` instances.
 */
export interface Reaction {
  emoji: string;
  /** In order of first reaction; the count is `userIds.length`. */
  userIds: string[];
}

export interface TimelineMessage {
  id: string;
  roomId: string;
  /** Per-room sequence, a decimal string. */
  seq: string;
  authorId: string | null;
  body: string;
  replyToId: string | null;
  mentions: MentionTarget[];
  /** From the server on REST pages, derived from the targets on live events. */
  mentionsMe: MentionsMe | null;
  editedAt: string | null;
  redactedAt: string | null;
  hiddenAt: string | null;
  createdAt: string;
  /** Driven by `reaction_*` events; empty for a tombstone. */
  reactions: Reaction[];
}

export type SendFailureReason =
  | 'read_only'
  | 'permission_denied'
  | 'body_too_long'
  | 'body_invalid'
  | 'mention_invalid'
  | 'not_found'
  | 'network'
  | 'unknown';

/** An own message being sent (or that failed to send), rendered after the confirmed ones. */
export interface PendingMessage {
  localId: string;
  body: string;
  /** The targets the body mentions, so the pending message can show its chips. */
  mentions: MentionTarget[];
  /** The message this one answers, so a pending or retried reply already shows its quote. */
  replyToId: string | null;
  state: 'sending' | 'failed';
  reason?: SendFailureReason;
}

export interface Timeline {
  /** Ascending `seq`, unique by `seq`. */
  messages: TimelineMessage[];
  hasMoreOlder: boolean;
  /**
   * True while the window ends before the newest message (opened at a message with
   * `around`): live `message_created` events are not inserted, they would leave a gap.
   */
  hasMoreNewer: boolean;
  /** Highest room `seq` reflected in `messages`. */
  lastSeq: string;
  pending: PendingMessage[];
}

/** The parts of a `MessagesPage` the timeline needs (items may still carry `Date`s). */
export interface MessagesPageLike {
  items: readonly Message[];
  lastSeq: string;
  hasMore: boolean;
  /** Absent on pages that end at the newest message. */
  hasMoreNewer?: boolean;
}

export interface ApplyResult {
  timeline: Timeline;
  /** Ids of messages whose current state must be fetched (`message_edited`). */
  refetch: string[];
}

function toIso(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' ? value : value.toISOString();
}

export function toTimelineMessage(message: Message): TimelineMessage {
  return {
    id: message.id,
    roomId: message.roomId,
    seq: message.seq,
    authorId: message.authorId,
    body: message.body,
    replyToId: message.replyToId,
    mentions: message.mentions,
    mentionsMe: parseMentionsMe(message.mentionsMe),
    editedAt: toIso(message.editedAt),
    redactedAt: toIso(message.redactedAt),
    hiddenAt: toIso(message.hiddenAt),
    createdAt: toIso(message.createdAt) ?? '',
    reactions: (message.reactions ?? []).map(({ emoji, userIds }) => ({
      emoji,
      userIds: [...userIds],
    })),
  };
}

/** `seq` values are decimal strings that can exceed `Number.MAX_SAFE_INTEGER`. */
export function compareSeq(a: string, b: string): number {
  const left = BigInt(a);
  const right = BigInt(b);
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function maxSeq(a: string, b: string): string {
  return compareSeq(a, b) >= 0 ? a : b;
}

function insertBySeq(messages: TimelineMessage[], message: TimelineMessage): TimelineMessage[] {
  if (messages.some((existing) => existing.seq === message.seq || existing.id === message.id)) {
    return messages;
  }
  const next = [...messages, message];
  next.sort((a, b) => compareSeq(a.seq, b.seq));
  return next;
}

function toTombstone(message: TimelineMessage, redactedAt: string): TimelineMessage {
  return { ...message, body: '', redactedAt: message.redactedAt ?? redactedAt, reactions: [] };
}

/** Set semantics: nothing changes when the user is already in the emoji's entry. */
function withReaction(reactions: Reaction[], emoji: string, userId: string): Reaction[] {
  const entry = reactions.find((reaction) => reaction.emoji === emoji);
  if (!entry) return [...reactions, { emoji, userIds: [userId] }];
  if (entry.userIds.includes(userId)) return reactions;
  return reactions.map((reaction) =>
    reaction === entry ? { emoji, userIds: [...reaction.userIds, userId] } : reaction,
  );
}

/** Drops the user, and the entry when it empties; nothing changes when the user is absent. */
function withoutReaction(reactions: Reaction[], emoji: string, userId: string): Reaction[] {
  const entry = reactions.find((reaction) => reaction.emoji === emoji);
  if (!entry?.userIds.includes(userId)) return reactions;
  const userIds = entry.userIds.filter((id) => id !== userId);
  if (userIds.length === 0) return reactions.filter((reaction) => reaction !== entry);
  return reactions.map((reaction) => (reaction === entry ? { emoji, userIds } : reaction));
}

function changeReaction(
  timeline: Timeline,
  messageId: string,
  emoji: string,
  userId: string,
  on: boolean,
): Timeline {
  const messages = replaceWhere(
    timeline.messages,
    (message) => message.id === messageId && message.redactedAt === null,
    (message) => {
      const reactions = on
        ? withReaction(message.reactions, emoji, userId)
        : withoutReaction(message.reactions, emoji, userId);
      return reactions === message.reactions ? message : { ...message, reactions };
    },
  );
  // Nothing changed (unknown message, replayed event): keep the state, so nothing re-renders.
  return messages.every((message, index) => message === timeline.messages[index])
    ? timeline
    : { ...timeline, messages };
}

/** Optimistic reaction of `userId` (the caller): the same code path as the stream events. */
export function toggleReactionLocally(
  timeline: Timeline,
  messageId: string,
  emoji: string,
  userId: string,
  on: boolean,
): Timeline {
  return changeReaction(timeline, messageId, emoji, userId, on);
}

/** Turns a message into a tombstone after a successful delete; idempotent with the stream echo. */
export function redactLocally(timeline: Timeline, messageId: string, at: string): Timeline {
  return {
    ...timeline,
    messages: replaceWhere(
      timeline.messages,
      (message) => message.id === messageId,
      (message) => toTombstone(message, at),
    ),
  };
}

function replaceWhere(
  messages: TimelineMessage[],
  matches: (message: TimelineMessage) => boolean,
  replace: (message: TimelineMessage) => TimelineMessage,
): TimelineMessage[] {
  return messages.map((message) => (matches(message) ? replace(message) : message));
}

/**
 * Timeline seeded from the newest page (`GET /rooms/:id/messages`), or from an
 * `around` page, which is detached while `hasMoreNewer` is set.
 */
export function mergeFirstPage(page: MessagesPageLike, pending: PendingMessage[] = []): Timeline {
  return {
    messages: page.items.map(toTimelineMessage),
    hasMoreOlder: page.hasMore,
    hasMoreNewer: page.hasMoreNewer ?? false,
    lastSeq: page.lastSeq,
    pending,
  };
}

/** Adds an older page in front of the loaded messages, ignoring the ones already there. */
export function prependOlder(timeline: Timeline, page: MessagesPageLike): Timeline {
  const known = new Set(timeline.messages.map((message) => message.seq));
  const older = page.items.map(toTimelineMessage).filter((message) => !known.has(message.seq));
  const messages = [...older, ...timeline.messages];
  messages.sort((a, b) => compareSeq(a.seq, b.seq));
  return { ...timeline, messages, hasMoreOlder: page.hasMore };
}

/**
 * Adds an `after` page behind the loaded messages, ignoring the ones already there.
 * Once `hasMoreNewer` is false the timeline is attached to the head again and behaves
 * as one opened on the newest page.
 */
export function appendNewer(timeline: Timeline, page: MessagesPageLike): Timeline {
  const known = new Set(timeline.messages.map((message) => message.seq));
  const newer = page.items.map(toTimelineMessage).filter((message) => !known.has(message.seq));
  const messages = [...timeline.messages, ...newer];
  messages.sort((a, b) => compareSeq(a.seq, b.seq));
  return {
    ...timeline,
    messages,
    hasMoreNewer: page.hasMoreNewer ?? false,
    lastSeq: maxSeq(timeline.lastSeq, page.lastSeq),
  };
}

/**
 * Replaces a message by id with a freshly fetched one (after a `message_edited`). The
 * reactions of the message already in the timeline are kept: they are driven by events,
 * and a fetch that raced a reaction event must not roll it back.
 */
export function replaceMessage(timeline: Timeline, message: TimelineMessage): Timeline {
  if (!timeline.messages.some((existing) => existing.id === message.id)) return timeline;
  return {
    ...timeline,
    messages: replaceWhere(
      timeline.messages,
      (existing) => existing.id === message.id,
      (existing) => ({ ...message, reactions: existing.reactions }),
    ),
  };
}

/**
 * Applies one room event. Events at or below `lastSeq` are ignored, which makes
 * the live stream, the durable-feed replay and `/sync` catch-up safe to overlap.
 * `viewer` derives `mentionsMe` for a `message_created`.
 */
export function applyRoomEvent(
  timeline: Timeline,
  event: RoomEvent,
  viewer: MentionViewer | null = null,
): ApplyResult {
  // A deletion rewrites the original row in place, so a redacted event keeps the
  // `seq` of the message it hides and would always look old to the guard below.
  if (event.type === 'message_redacted') {
    const messages = replaceWhere(
      timeline.messages,
      (message) => message.seq === event.seq,
      (message) => toTombstone(message, event.createdAt),
    );
    return {
      timeline: { ...timeline, messages, lastSeq: maxSeq(timeline.lastSeq, event.seq) },
      refetch: [],
    };
  }

  if (compareSeq(event.seq, timeline.lastSeq) <= 0) return { timeline, refetch: [] };

  const advanced: Timeline = { ...timeline, lastSeq: event.seq };

  switch (event.type) {
    case 'message_created': {
      // Detached: inserting it would leave a gap; it is loaded when the window catches up.
      if (timeline.hasMoreNewer) return { timeline: advanced, refetch: [] };
      const { messageId, body, replyToId, mentions } = event.content;
      const message: TimelineMessage = {
        id: messageId,
        roomId: event.roomId,
        seq: event.seq,
        authorId: event.senderId,
        body,
        replyToId,
        mentions,
        mentionsMe: deriveMentionsMe(mentions, event.senderId, viewer),
        editedAt: null,
        redactedAt: null,
        hiddenAt: null,
        createdAt: event.createdAt,
        reactions: [],
      };
      return {
        timeline: { ...advanced, messages: insertBySeq(timeline.messages, message) },
        refetch: [],
      };
    }
    case 'message_edited': {
      const known = timeline.messages.some((message) => message.id === event.content.messageId);
      return { timeline: advanced, refetch: known ? [event.content.messageId] : [] };
    }
    case 'message_deleted': {
      const messages = replaceWhere(
        timeline.messages,
        (message) => message.seq === event.content.messageSeq,
        (message) => toTombstone(message, event.createdAt),
      );
      return { timeline: { ...advanced, messages }, refetch: [] };
    }
    case 'reaction_added':
    case 'reaction_removed': {
      if (event.senderId === null) return { timeline: advanced, refetch: [] };
      return {
        timeline: changeReaction(
          advanced,
          event.content.messageId,
          event.content.emoji,
          event.senderId,
          event.type === 'reaction_added',
        ),
        refetch: [],
      };
    }
    default:
      return { timeline: advanced, refetch: [] };
  }
}

export function addPending(timeline: Timeline, pending: PendingMessage): Timeline {
  return { ...timeline, pending: [...timeline.pending, pending] };
}

function updatePending(
  timeline: Timeline,
  localId: string,
  update: (pending: PendingMessage) => PendingMessage,
): Timeline {
  return {
    ...timeline,
    pending: timeline.pending.map((entry) => (entry.localId === localId ? update(entry) : entry)),
  };
}

export function markPendingFailed(
  timeline: Timeline,
  localId: string,
  reason: SendFailureReason,
): Timeline {
  return updatePending(timeline, localId, (entry) => ({ ...entry, state: 'failed', reason }));
}

export function markPendingSending(timeline: Timeline, localId: string): Timeline {
  return updatePending(timeline, localId, ({ reason, ...entry }) => {
    void reason;
    return { ...entry, state: 'sending' };
  });
}

/**
 * Removes the pending entry once the server confirmed it, and inserts the
 * confirmed message. The insert is idempotent: the stream may have delivered it first.
 */
export function reconcilePending(
  timeline: Timeline,
  localId: string,
  message: TimelineMessage,
): Timeline {
  return {
    ...timeline,
    // Detached: the message belongs after a gap; it is loaded when the window catches up.
    messages: timeline.hasMoreNewer ? timeline.messages : insertBySeq(timeline.messages, message),
    pending: timeline.pending.filter((entry) => entry.localId !== localId),
  };
}
