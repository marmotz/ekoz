/**
 * Room messages (web-client-chat technical design §5).
 */

import type { SessionManager } from '../session/session-manager.js';
import type {
  Membership,
  Message,
  MessagePin,
  MessagesPage,
  MessagesPolicy,
} from '../types/wire.js';

/** A room role, as carried by a membership. */
export type MentionRole = Membership['role'];

/**
 * What a client sends to mention someone or something. The server resolves it
 * into a `MentionTarget` with a frozen token and audience (`all`, `role` and
 * `group` are channel-only).
 */
export type MentionInput =
  | { type: 'user'; userId: string }
  | { type: 'all' }
  | { type: 'role'; role: MentionRole }
  | { type: 'group'; groupId: string };

/** At most one of `before`, `after` and `around` may be set. */
export interface ListMessagesParams {
  /** The newest page of messages strictly before this `seq`. */
  before?: string;
  /** The oldest page of messages strictly after this `seq`. */
  after?: string;
  /** A window of messages around this `seq`, the message itself included. */
  around?: string;
  limit?: number;
}

/** `POST /rooms/:id/messages` body. Not in the OpenAPI description, so declared by hand. */
export interface SendMessageBody {
  body: string;
  replyToId?: string;
  mentions?: MentionInput[];
}

/** `PATCH /rooms/:id/messages/:messageId` body. `mentions` absent leaves the targets alone. */
export interface EditMessageBody {
  body: string;
  mentions?: MentionInput[];
}

export interface MessagesResource {
  /** `GET /messages/policy`: the limits applied to messages (`bodyMaxLength`, `editWindow`). */
  policy(): Promise<MessagesPolicy>;
  list(roomId: string, params?: ListMessagesParams): Promise<MessagesPage>;
  get(roomId: string, messageId: string): Promise<Message>;
  send(roomId: string, body: SendMessageBody): Promise<Message>;
  edit(roomId: string, messageId: string, body: EditMessageBody): Promise<Message>;
  /** `DELETE /rooms/:id/messages/:messageId`: the author (`room.delete_own`) or a moderator (`room.delete_any`). */
  delete(roomId: string, messageId: string): Promise<void>;
  /** `PUT /rooms/:id/pins/:messageId`: pin a message; the pin embeds it. */
  pin(roomId: string, messageId: string): Promise<MessagePin>;
  /** `DELETE /rooms/:id/pins/:messageId`. */
  unpin(roomId: string, messageId: string): Promise<void>;
  /** `GET /rooms/:id/pins`: every pin, newest first, each with its message. Not paginated. */
  pins(roomId: string): Promise<MessagePin[]>;
  /** `PUT /messages/:messageId/reactions/:emoji`. Reacting twice is a `409`. Not room-scoped. */
  react(messageId: string, emoji: string): Promise<void>;
  /** `DELETE /messages/:messageId/reactions/:emoji`: removes the caller's own reaction. */
  unreact(messageId: string, emoji: string): Promise<void>;
}

export function createMessagesResource(session: SessionManager): MessagesResource {
  const base = (roomId: string) => `/rooms/${encodeURIComponent(roomId)}/messages`;
  const pins = (roomId: string) => `/rooms/${encodeURIComponent(roomId)}/pins`;
  const reaction = (messageId: string, emoji: string) =>
    `/messages/${encodeURIComponent(messageId)}/reactions/${encodeURIComponent(emoji)}`;

  return {
    policy() {
      return session.request<MessagesPolicy>('GET', '/messages/policy');
    },

    list(roomId, params = {}) {
      return session.request<MessagesPage>('GET', base(roomId), {
        query: {
          before: params.before,
          after: params.after,
          around: params.around,
          limit: params.limit,
        },
      });
    },

    get(roomId, messageId) {
      return session.request<Message>('GET', `${base(roomId)}/${encodeURIComponent(messageId)}`);
    },

    send(roomId, body) {
      return session.request<Message>('POST', base(roomId), { body });
    },

    edit(roomId, messageId, body) {
      return session.request<Message>('PATCH', `${base(roomId)}/${encodeURIComponent(messageId)}`, {
        body,
      });
    },

    delete(roomId, messageId) {
      return session.request<void>('DELETE', `${base(roomId)}/${encodeURIComponent(messageId)}`);
    },

    pin(roomId, messageId) {
      return session.request<MessagePin>('PUT', `${pins(roomId)}/${encodeURIComponent(messageId)}`);
    },

    unpin(roomId, messageId) {
      return session.request<void>('DELETE', `${pins(roomId)}/${encodeURIComponent(messageId)}`);
    },

    pins(roomId) {
      return session.request<MessagePin[]>('GET', pins(roomId));
    },

    react(messageId, emoji) {
      return session.request<void>('PUT', reaction(messageId, emoji));
    },

    unreact(messageId, emoji) {
      return session.request<void>('DELETE', reaction(messageId, emoji));
    },
  };
}
