import { beforeEach, expect, it, vi } from 'vitest';

import { localStorageSessionStore, SESSION_STORAGE_KEY } from '@/shared/sdk/session-store';

const state = { refreshToken: 'refresh-1', sessionId: 'session-1', identifier: 'alice@ekoz.test' };

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

it('round-trips a saved session', () => {
  const store = localStorageSessionStore();

  store.save(state);

  expect(store.load()).toEqual(state);
  expect(JSON.parse(window.localStorage.getItem(SESSION_STORAGE_KEY) ?? '')).toEqual(state);
});

it('accepts a null identifier', () => {
  const store = localStorageSessionStore();

  store.save({ ...state, identifier: null });

  expect(store.load()).toEqual({ ...state, identifier: null });
});

it('loads null when nothing is stored', () => {
  expect(localStorageSessionStore().load()).toBeNull();
});

it('forgets the session on clear', () => {
  const store = localStorageSessionStore();
  store.save(state);

  store.clear();

  expect(store.load()).toBeNull();
});

it.each([
  ['invalid JSON', '{not json'],
  ['a non-object', '"text"'],
  ['null', 'null'],
  ['a missing refresh token', JSON.stringify({ sessionId: 's', identifier: null })],
  ['a wrongly typed session id', JSON.stringify({ ...state, sessionId: 42 })],
])('loads null for %s', (_label, raw) => {
  window.localStorage.setItem(SESSION_STORAGE_KEY, raw);

  expect(localStorageSessionStore().load()).toBeNull();
});

it('tolerates an unavailable storage', () => {
  const unavailable = () => {
    throw new DOMException('denied', 'SecurityError');
  };
  vi.spyOn(window.localStorage, 'getItem').mockImplementation(unavailable);
  vi.spyOn(window.localStorage, 'setItem').mockImplementation(unavailable);
  vi.spyOn(window.localStorage, 'removeItem').mockImplementation(unavailable);
  const store = localStorageSessionStore();

  expect(store.load()).toBeNull();
  expect(() => store.save(state)).not.toThrow();
  expect(() => store.clear()).not.toThrow();
});
