/**
 * Room messages (web-client-chat technical design §5).
 */

import type { SessionManager } from '../session/session-manager.js';
import type { Message, MessagesPage } from '../types/wire.js';

export interface ListMessagesParams {
  /** Return the page of messages strictly before this `seq`. */
  before?: string;
  limit?: number;
}

/** `POST /rooms/:id/messages` body. Not in the OpenAPI description, so declared by hand. */
export interface SendMessageBody {
  body: string;
  replyToId?: string;
  mentions?: string[];
}

export interface MessagesResource {
  list(roomId: string, params?: ListMessagesParams): Promise<MessagesPage>;
  get(roomId: string, messageId: string): Promise<Message>;
  send(roomId: string, body: SendMessageBody): Promise<Message>;
}

export function createMessagesResource(session: SessionManager): MessagesResource {
  const base = (roomId: string) => `/rooms/${encodeURIComponent(roomId)}/messages`;

  return {
    list(roomId, params = {}) {
      return session.request<MessagesPage>('GET', base(roomId), {
        query: { before: params.before, limit: params.limit },
      });
    },

    get(roomId, messageId) {
      return session.request<Message>('GET', `${base(roomId)}/${encodeURIComponent(messageId)}`);
    },

    send(roomId, body) {
      return session.request<Message>('POST', base(roomId), { body });
    },
  };
}
