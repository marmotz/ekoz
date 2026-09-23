import type { EkozClient, SessionEventMap, SessionEventName } from '@ekozhq/sdk';
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

/**
 * Stand-in for an `EkozClient`: a working `on`/`off`/`once` emitter, a session
 * whose state the test controls, and stubbed `discovery`, `setup`, `auth`, `me`, `sessions` and `users`. Tests drive it with
 * `emit()` and `setSession()`; nothing touches the network.
 */
export function createFakeSdk(initial?: FakeSession) {
  let session: FakeSession | undefined = initial;
  const listeners = new Map<string, Set<Listener>>();

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
      avatar: vi.fn(async () => new Blob(['avatar'], { type: 'image/png' })),
    },
    on: vi.fn(on),
    off: vi.fn(off),
    once: vi.fn(on),
  };

  return {
    sdk: sdk as unknown as EkozClient,
    /** The raw stubs, for assertions. */
    stubs: sdk,
    emit,
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
