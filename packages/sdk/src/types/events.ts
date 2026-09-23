/**
 * Hand-written room event types. The generated `SyncResponseDtoEvents` types
 * `content` as `string` (the server sends `z.unknown()`) and timestamps as
 * `Date` (the wire carries ISO strings), so events are modelled here as a
 * discriminated union on `type` instead (web-client-chat technical design §5).
 */

export interface RoomEventBase {
  roomId: string;
  /** Per-room sequence, a decimal string (it can exceed `Number.MAX_SAFE_INTEGER`). */
  seq: string;
  senderId: string | null;
  /** ISO-8601 timestamp. */
  createdAt: string;
  /** Present on `GET /sync` events, absent on stream frames. */
  originServer?: string;
}

export interface MessageCreatedEvent extends RoomEventBase {
  type: 'message_created';
  content: {
    messageId: string;
    body: string;
    replyToId: string | null;
    mentions: string[];
  };
}

export interface MessageEditedEvent extends RoomEventBase {
  type: 'message_edited';
  content: { messageId: string; editedAt: string };
}

export interface MessageDeletedEvent extends RoomEventBase {
  type: 'message_deleted';
  content: { messageId: string; messageSeq: string; reason: 'user' | 'retention' };
}

export interface MessageRedactedEvent extends RoomEventBase {
  type: 'message_redacted';
  content: { reason: 'user' | 'retention' };
}

/** Every event type the server can emit besides the four typed above. */
export type OtherRoomEventType =
  | 'message_hidden'
  | 'reaction_added'
  | 'reaction_removed'
  | 'member_joined'
  | 'member_left'
  | 'member_kicked'
  | 'member_banned'
  | 'member_unbanned'
  | 'role_changed'
  | 'permission_override_changed'
  | 'room_created'
  | 'room_updated'
  | 'room_moved'
  | 'room_deleted'
  | 'pin_added'
  | 'pin_removed'
  | 'retention_changed'
  | 'receipt_updated';

/** Fallback for every other event type: the content is left untouched. */
export interface UnknownRoomEvent extends RoomEventBase {
  type: OtherRoomEventType;
  content: unknown;
}

export type RoomEvent =
  | MessageCreatedEvent
  | MessageEditedEvent
  | MessageDeletedEvent
  | MessageRedactedEvent
  | UnknownRoomEvent;

/** `GET /sync` response, with `events` typed by {@link RoomEvent}. */
export interface SyncResponse {
  events: RoomEvent[];
  lastSeq: string;
}
