import { beforeEach, describe, expect, it } from 'vitest';

import { localStorageSessionStore } from '@/shared/sdk/session-store';

describe('localStorageSessionStore', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('round-trips a saved session', () => {
    const store = localStorageSessionStore();
    const state = { refreshToken: 'r1', sessionId: 's1', identifier: 'alice' };

    store.save(state);

    expect(store.load()).toEqual(state);
  });

  it('returns null when nothing is stored', () => {
    expect(localStorageSessionStore().load()).toBeNull();
  });

  it('returns null and does not throw on corrupt data', () => {
    window.localStorage.setItem('ekoz.admin.session', '{not json');

    expect(localStorageSessionStore().load()).toBeNull();
  });

  it('returns null when the stored shape is invalid', () => {
    window.localStorage.setItem('ekoz.admin.session', JSON.stringify({ foo: 'bar' }));

    expect(localStorageSessionStore().load()).toBeNull();
  });

  it('clears the stored session', () => {
    const store = localStorageSessionStore();
    store.save({ refreshToken: 'r1', sessionId: 's1', identifier: null });

    store.clear();

    expect(store.load()).toBeNull();
  });
});
