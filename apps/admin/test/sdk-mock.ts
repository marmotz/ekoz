import type { EkozClient, SessionEventMap, SessionEventName } from '@ekozhq/sdk';
import { vi } from 'vitest';

type Listener<Name extends SessionEventName> = (...args: SessionEventMap[Name]) => void;

export interface MockSdk extends EkozClient {
  __emit<Name extends SessionEventName>(name: Name, ...args: SessionEventMap[Name]): void;
}

/** A fully mocked `EkozClient` for component tests (technical.md §4: SDK module mocked, no MSW). */
export function createMockSdk(overrides: Partial<EkozClient> = {}): MockSdk {
  const listeners = new Map<SessionEventName, Set<Listener<SessionEventName>>>();

  const on = vi.fn(<Name extends SessionEventName>(name: Name, listener: Listener<Name>) => {
    let set = listeners.get(name);
    if (!set) {
      set = new Set();
      listeners.set(name, set);
    }
    set.add(listener as Listener<SessionEventName>);
    return () => set.delete(listener as Listener<SessionEventName>);
  });

  const sdk: MockSdk = {
    setup: {
      state: vi.fn(),
      createOwner: vi.fn(),
    },
    auth: {
      policy: vi.fn(),
      register: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
      verifyEmail: vi.fn(),
      resendVerification: vi.fn(),
      requestPasswordReset: vi.fn(),
      confirmPasswordReset: vi.fn(),
    },
    me: {
      get: vi.fn(async () => ({ isOwner: true }) as never),
      updateProfile: vi.fn(),
      setAvatar: vi.fn(),
      deleteAvatar: vi.fn(),
      changeEmail: vi.fn(),
      changeUsername: vi.fn(),
      usernameState: vi.fn(),
      cancelUsernameRequest: vi.fn(),
      changePassword: vi.fn(),
      deleteAccount: vi.fn(),
    },
    users: {
      getProfile: vi.fn(),
      summaries: vi.fn(),
      avatar: vi.fn(),
    },
    sessions: {
      list: vi.fn(),
      rename: vi.fn(),
      revoke: vi.fn(),
      revokeAllOthers: vi.fn(),
    },
    invitations: {
      create: vi.fn(),
      list: vi.fn(),
      revoke: vi.fn(),
    },
    admin: {
      users: {
        list: vi.fn(),
        get: vi.fn(),
        create: vi.fn(),
        suspend: vi.fn(),
        unsuspend: vi.fn(),
        delete: vi.fn(),
        triggerPasswordReset: vi.fn(),
      },
      owners: {
        add: vi.fn(),
        remove: vi.fn(),
      },
      usernameRequests: {
        list: vi.fn(),
        approve: vi.fn(),
        reject: vi.fn(),
      },
    },
    rooms: {
      list: vi.fn(),
      get: vi.fn(),
      preview: vi.fn(),
      children: vi.fn(),
      myPermissions: vi.fn(),
      createSpace: vi.fn(),
      createChannel: vi.fn(),
      join: vi.fn(),
      leave: vi.fn(),
      requestToJoin: vi.fn(),
      listJoinRequests: vi.fn(),
      approveJoinRequest: vi.fn(),
      rejectJoinRequest: vi.fn(),
      members: vi.fn(),
    },
    roomInvitations: {
      listMine: vi.fn(),
      accept: vi.fn(),
      decline: vi.fn(),
    },
    directory: {
      list: vi.fn(),
    },
    messages: {
      list: vi.fn(),
      get: vi.fn(),
      send: vi.fn(),
      edit: vi.fn(),
    },
    mentions: {
      list: vi.fn(),
      unread: vi.fn(),
    },
    groups: {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      rename: vi.fn(),
      remove: vi.fn(),
      addMember: vi.fn(),
      removeMember: vi.fn(),
    },
    sync: {
      get: vi.fn(),
    },
    stream: {
      connect: vi.fn(),
      disconnect: vi.fn(),
      status: 'idle',
      on: vi.fn(() => () => {}),
    },
    discovery: {} as EkozClient['discovery'],
    session: {
      getState: vi.fn(() => ({ identifier: 'owner', sessionId: 's1' })),
      resume: vi.fn(async () => {}),
      clear: vi.fn(async () => {}),
    },
    on: on as EkozClient['on'],
    off: vi.fn(),
    once: vi.fn(),
    __emit(name, ...args) {
      for (const listener of listeners.get(name) ?? []) {
        listener(...args);
      }
    },
    ...overrides,
  };

  return sdk;
}
