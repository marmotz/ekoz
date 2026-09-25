/**
 * `createClient(config)` → `EkozClient` (technical.md §10). Wires discovery,
 * the transport, the session manager and every resource namespace behind a
 * single instance shared across a consumer's app.
 */

import { type ClientConfig, normaliseConfig } from './config.js';
import { Discovery } from './discovery/discovery.js';
import { type AdminResource, createAdminResource } from './resources/admin.js';
import { type AuthResource, createAuthResource } from './resources/auth.js';
import { createDirectoryResource, type DirectoryResource } from './resources/directory.js';
import { createGroupsResource, type GroupsResource } from './resources/groups.js';
import { createInvitationsResource, type InvitationsResource } from './resources/invitations.js';
import { createMeResource, type MeResource } from './resources/me.js';
import { createMentionsResource, type MentionsResource } from './resources/mentions.js';
import { createMessagesResource, type MessagesResource } from './resources/messages.js';
import {
  createRoomInvitationsResource,
  type RoomInvitationsResource,
} from './resources/room-invitations.js';
import { createRoomsResource, type RoomsResource } from './resources/rooms.js';
import { createSessionsResource, type SessionsResource } from './resources/sessions.js';
import { createSetupResource, type SetupResource } from './resources/setup.js';
import { createRoomStream, type RoomStream } from './resources/stream.js';
import { createSyncResource, type SyncResource } from './resources/sync.js';
import { createUsersResource, type UsersResource } from './resources/users.js';
import type { SessionEventMap, SessionEventName } from './session/events.js';
import { SessionEventEmitter } from './session/events.js';
import { SessionManager } from './session/session-manager.js';
import { HttpClient } from './transport/http-client.js';

/** Local session controls exposed as `client.session.*` (technical.md §10). */
export interface SessionController {
  getState(): { identifier: string | null; sessionId: string } | undefined;
  resume(): Promise<void>;
  clear(): Promise<void>;
}

export interface EkozClient {
  setup: SetupResource;
  auth: AuthResource;
  me: MeResource;
  users: UsersResource;
  sessions: SessionsResource;
  invitations: InvitationsResource;
  admin: AdminResource;
  rooms: RoomsResource;
  roomInvitations: RoomInvitationsResource;
  directory: DirectoryResource;
  messages: MessagesResource;
  mentions: MentionsResource;
  groups: GroupsResource;
  sync: SyncResource;
  stream: RoomStream;
  discovery: Discovery;
  session: SessionController;
  on<Name extends SessionEventName>(
    name: Name,
    listener: (...args: SessionEventMap[Name]) => void,
  ): () => void;
  off<Name extends SessionEventName>(
    name: Name,
    listener: (...args: SessionEventMap[Name]) => void,
  ): void;
  once<Name extends SessionEventName>(
    name: Name,
    listener: (...args: SessionEventMap[Name]) => void,
  ): () => void;
}

/**
 * Lazily resolves the REST base URL through discovery before every request —
 * `HttpClient` itself takes a fixed `baseUrl`, and discovery resolution is
 * async, so it cannot be resolved synchronously inside `createClient`.
 */
function createDiscoveredFetch(discovery: Discovery, fetchImpl: typeof fetch): typeof fetch {
  return async (input, init) => {
    const baseUrl = await discovery.apiBaseUrl();
    const path = typeof input === 'string' && input.startsWith('/') ? `${baseUrl}${input}` : input;
    return fetchImpl(path, init);
  };
}

export function createClient(config: ClientConfig): EkozClient {
  const normalised = normaliseConfig(config);
  const fetchImpl = normalised.fetch ?? globalThis.fetch;

  const discovery = new Discovery({
    server: normalised.server,
    resolveApiUrl: normalised.resolveApiUrl,
    fetch: fetchImpl,
  });

  // `baseUrl` is unused once requests are routed through `fetch` below, which
  // resolves the real base per call; kept empty so `HttpClient` still builds
  // path + query the same way regardless of transport.
  const httpClient = new HttpClient({
    baseUrl: '',
    fetch: createDiscoveredFetch(discovery, fetchImpl),
  });

  const emitter = new SessionEventEmitter();
  const session = new SessionManager({ httpClient, emitter, store: normalised.store });

  return {
    setup: createSetupResource(httpClient, session),
    auth: createAuthResource(httpClient, session),
    me: createMeResource(session),
    users: createUsersResource(session),
    sessions: createSessionsResource(session),
    invitations: createInvitationsResource(session),
    admin: createAdminResource(session),
    rooms: createRoomsResource(session),
    roomInvitations: createRoomInvitationsResource(session),
    directory: createDirectoryResource(session),
    messages: createMessagesResource(session),
    mentions: createMentionsResource(session),
    groups: createGroupsResource(session),
    sync: createSyncResource(session),
    stream: createRoomStream({
      session,
      discovery,
      emitter,
      eventSource: normalised.eventSource,
    }),
    discovery,
    session: {
      getState: () => session.getState(),
      resume: () => session.resume(),
      clear: () => session.clear(),
    },
    on: emitter.on.bind(emitter),
    off: emitter.off.bind(emitter),
    once: emitter.once.bind(emitter),
  };
}
