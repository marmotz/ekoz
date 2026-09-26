import type { EkozClient, SessionEventMap, SessionEventName, UserSummary } from '@ekozhq/sdk';
import { vi } from 'vitest';

type Listener = (...args: unknown[]) => void;

export interface FakeSession {
  identifier: string | null;
  sessionId: string;
}

/** The account `me.get` answers with unless a test overrides it. */
export const defaultMe = {
  id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  identifier: 'jane/example.test',
  email: 'jane@example.test',
  displayName: 'Jane Doe',
  isOwner: false,
  emailVerified: true,
  status: 'active',
  avatarUrl: null as string | null,
  pendingEmail: null as string | null,
  bio: null as string | null,
};

type StreamEventName = 'room_event' | 'account' | 'presence' | 'typing' | 'status' | 'reconnected';

/** A controllable `RoomStream`: tests push events with `emit()` and change `status`. */
export function createFakeStream() {
  const listeners = new Map<string, Set<Listener>>();
  const stream = {
    status: 'idle' as 'idle' | 'connecting' | 'open' | 'reconnecting',
    connect: vi.fn(() => {}),
    disconnect: vi.fn(() => {}),
    on: vi.fn((name: string, listener: Listener) => {
      let set = listeners.get(name);
      if (!set) {
        set = new Set();
        listeners.set(name, set);
      }
      set.add(listener);
      return () => {
        listeners.get(name)?.delete(listener);
      };
    }),
  };

  return {
    stream,
    emit(name: StreamEventName, ...args: unknown[]) {
      for (const listener of [...(listeners.get(name) ?? [])]) listener(...args);
    },
    setStatus(status: typeof stream.status) {
      stream.status = status;
      for (const listener of [...(listeners.get('status') ?? [])]) listener(status);
    },
    listenerCount: (name: StreamEventName) => listeners.get(name)?.size ?? 0,
  };
}

/**
 * Stand-in for an `EkozClient`: a working `on`/`off`/`once` emitter, a session
 * whose state the test controls, and stubbed `discovery`, `setup`, `auth`, `me`, `sessions`, `users`, `messages`, `receipts`, `groups`, `mentions`, `rooms`, `roomInvitations`, `directory`, `sync` and `stream`. Tests drive it with
 * `emit()` and `setSession()`; nothing touches the network.
 */
export function createFakeSdk(initial?: FakeSession) {
  let session: FakeSession | undefined = initial;
  const listeners = new Map<string, Set<Listener>>();
  const fakeStream = createFakeStream();

  const off = (name: string, listener: Listener) => {
    listeners.get(name)?.delete(listener);
  };
  const on = (name: string, listener: Listener) => {
    let set = listeners.get(name);
    if (!set) {
      set = new Set();
      listeners.set(name, set);
    }
    set.add(listener);
    return () => off(name, listener);
  };
  const emit = <Name extends SessionEventName>(name: Name, ...args: SessionEventMap[Name]) => {
    for (const listener of [...(listeners.get(name) ?? [])]) listener(...args);
  };

  const sdk = {
    session: {
      getState: vi.fn(() => session),
      resume: vi.fn(async () => {}),
      clear: vi.fn(async () => {
        session = undefined;
        emit('session:cleared', {});
      }),
    },
    discovery: {
      apiBaseUrl: vi.fn(async () => 'http://localhost:3010'),
    },
    setup: {
      state: vi.fn(async () => ({ state: 'closed' })),
    },
    auth: {
      policy: vi.fn(async () => ({
        registrationMode: 'open',
        emailVerificationRequired: true,
        passwordMinLength: 12,
      })),
      register: vi.fn(async () => ({})),
      login: vi.fn(async () => ({})),
      logout: vi.fn(async () => {}),
      verifyEmail: vi.fn(async () => ({ verified: true })),
      resendVerification: vi.fn(async () => ({ accepted: true })),
      requestPasswordReset: vi.fn(async () => ({ accepted: true })),
      confirmPasswordReset: vi.fn(async () => {}),
    },
    me: {
      get: vi.fn(async () => ({ ...defaultMe })),
      updateProfile: vi.fn(async (body: Record<string, unknown>) => ({ ...defaultMe, ...body })),
      setAvatar: vi.fn(async () => ({ avatarUrl: 'http://localhost:3010/users/jane/avatar?v=2' })),
      deleteAvatar: vi.fn(async () => {}),
      changeEmail: vi.fn(async () => ({ accepted: true })),
      changeUsername: vi.fn(async () => ({ status: 'applied', identifier: 'jane/example.test' })),
      usernameState: vi.fn(async () => ({
        policy: 'available',
        nextChangeAt: null,
        pendingRequest: null,
      })),
      cancelUsernameRequest: vi.fn(async () => {}),
      changePassword: vi.fn(async () => {}),
      deleteAccount: vi.fn(async () => {}),
    },
    sessions: {
      list: vi.fn(async () => []),
      rename: vi.fn(async (id: string, body: { deviceName: string }) => ({ id, ...body })),
      revoke: vi.fn(async () => {}),
      revokeAllOthers: vi.fn(async () => ({ revoked: 0 })),
    },
    users: {
      getProfile: vi.fn(async () => ({})),
      summaries: vi.fn(
        async (ids: readonly string[]): Promise<UserSummary[]> =>
          ids.map((id) => ({ id, identifier: null, displayName: null, avatarUrl: null })),
      ),
      avatar: vi.fn(async () => new Blob(['avatar'], { type: 'image/png' })),
    },
    messages: {
      policy: vi.fn(async () => ({ bodyMaxLength: 16_000 })),
      list: vi.fn(async () => ({ items: [], lastSeq: '0', hasMore: false, hasMoreNewer: false })),
      get: vi.fn(async () => ({})),
      send: vi.fn(async () => ({})),
      edit: vi.fn(async () => ({})),
      delete: vi.fn(async () => undefined),
      pin: vi.fn(async () => ({})),
      unpin: vi.fn(async () => undefined),
      pins: vi.fn(async () => [] as unknown[]),
      react: vi.fn(async () => undefined),
      unreact: vi.fn(async () => undefined),
    },
    receipts: {
      set: vi.fn(async (_roomId: string, seq: string) => ({ userId: defaultMe.id, seq })),
      list: vi.fn(async () => [] as unknown[]),
    },
    groups: {
      list: vi.fn(async () => ({ items: [] as unknown[] })),
      get: vi.fn(async () => ({})),
      create: vi.fn(async () => ({})),
      rename: vi.fn(async () => ({})),
      remove: vi.fn(async () => {}),
      addMember: vi.fn(async () => {}),
      removeMember: vi.fn(async () => {}),
    },
    mentions: {
      list: vi.fn(async () => ({ items: [] as unknown[], nextCursor: null as string | null })),
      unread: vi.fn(async () => ({ items: [] as unknown[] })),
    },
    rooms: {
      list: vi.fn(async () => ({ items: [] as unknown[] })),
      get: vi.fn(async (id: string) => ({ id })),
      preview: vi.fn(async (id: string) => ({ id, joinRequest: null })),
      myPermissions: vi.fn(async () => ({ capabilities: [] as string[] })),
      createSpace: vi.fn(async (body: Record<string, unknown>) => ({ id: 'space', ...body })),
      createChannel: vi.fn(async (body: Record<string, unknown>) => ({ id: 'channel', ...body })),
      join: vi.fn(async () => ({})),
      leave: vi.fn(async () => {}),
      requestToJoin: vi.fn(async () => ({})),
      listJoinRequests: vi.fn(async () => ({ items: [], nextCursor: null as string | null })),
      approveJoinRequest: vi.fn(async () => ({})),
      rejectJoinRequest: vi.fn(async () => {}),
      members: vi.fn(async () => ({ items: [], nextCursor: null })),
    },
    roomInvitations: {
      listMine: vi.fn(async () => ({ items: [] as unknown[] })),
      accept: vi.fn(async () => ({})),
      decline: vi.fn(async () => {}),
    },
    directory: {
      list: vi.fn(async () => ({ items: [], nextCursor: null as string | null })),
    },
    sync: {
      get: vi.fn(async () => ({ events: [], lastSeq: '0' })),
    },
    stream: fakeStream.stream,
    on: vi.fn(on),
    off: vi.fn(off),
    once: vi.fn(on),
  };

  return {
    sdk: sdk as unknown as EkozClient,
    /** The raw stubs, for assertions. */
    stubs: sdk,
    emit,
    /** The fake `sdk.stream`: `emit('room_event', ...)`, `setStatus('open')`, ... */
    streamControl: fakeStream,
    setSession(next: FakeSession | undefined) {
      session = next;
    },
    listenerCount: (name: SessionEventName) => listeners.get(name)?.size ?? 0,
  };
}

/** `createClient` replacement; see `mockSdkModule`. */
export const createClientMock = vi.fn<(...args: unknown[]) => EkozClient>();

/**
 * Factory for `vi.mock('@ekozhq/sdk', ...)`: keeps the real exports (error
 * classes, ...) and swaps only `createClient` for `createClientMock`.
 *
 *   vi.mock('@ekozhq/sdk', async (importOriginal) =>
 *     (await import('<path>/test/sdk-mock')).mockSdkModule(await importOriginal()));
 */
export function mockSdkModule<T extends object>(actual: T): T & { createClient: unknown } {
  return { ...actual, createClient: createClientMock };
}
