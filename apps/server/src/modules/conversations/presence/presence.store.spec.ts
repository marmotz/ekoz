import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InProcessPresenceStore } from './presence.store.js';

const AWAY = 5000;
const OFFLINE = 15000;

describe('InProcessPresenceStore (unit)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is offline before any heartbeat', () => {
    const store = new InProcessPresenceStore();
    expect(store.statusOf('u1', AWAY, OFFLINE)).toBe('offline');
  });

  it('is online right after a heartbeat, away after the away window, offline after the offline window', () => {
    const store = new InProcessPresenceStore();
    store.heartbeat('u1', 'c1', false);
    expect(store.statusOf('u1', AWAY, OFFLINE)).toBe('online');

    vi.advanceTimersByTime(6000);
    expect(store.statusOf('u1', AWAY, OFFLINE)).toBe('away');

    vi.advanceTimersByTime(10000);
    expect(store.statusOf('u1', AWAY, OFFLINE)).toBe('offline');
  });

  it('an idle heartbeat reports away immediately, within the away window', () => {
    const store = new InProcessPresenceStore();
    store.heartbeat('u1', 'c1', true);
    expect(store.statusOf('u1', AWAY, OFFLINE)).toBe('away');
  });

  it('aggregates clients: one idle and one active is online, all idle is away', () => {
    const store = new InProcessPresenceStore();
    store.heartbeat('u1', 'idle-tab', true);
    store.heartbeat('u1', 'active-tab', false);
    expect(store.statusOf('u1', AWAY, OFFLINE)).toBe('online');

    store.heartbeat('u1', 'active-tab', true);
    expect(store.statusOf('u1', AWAY, OFFLINE)).toBe('away');
  });

  it('a stale active client does not keep the user online, a fresh idle one keeps them away', () => {
    const store = new InProcessPresenceStore();
    store.heartbeat('u1', 'active-tab', false);
    vi.advanceTimersByTime(6000);
    store.heartbeat('u1', 'idle-tab', true);

    expect(store.statusOf('u1', AWAY, OFFLINE)).toBe('away');
  });

  it('is offline once every client is past the offline window', () => {
    const store = new InProcessPresenceStore();
    store.heartbeat('u1', 'c1', false);
    vi.advanceTimersByTime(10000);
    store.heartbeat('u1', 'c2', false);
    vi.advanceTimersByTime(6000);

    expect(store.statusOf('u1', AWAY, OFFLINE)).toBe('away');

    vi.advanceTimersByTime(10000);
    expect(store.statusOf('u1', AWAY, OFFLINE)).toBe('offline');
  });

  it('manual away wins over an active client, but not over offline', () => {
    const store = new InProcessPresenceStore();
    store.setManualAway('u1', true);
    expect(store.statusOf('u1', AWAY, OFFLINE)).toBe('offline');

    store.heartbeat('u1', 'c1', false);
    expect(store.statusOf('u1', AWAY, OFFLINE)).toBe('away');

    store.setManualAway('u1', false);
    expect(store.statusOf('u1', AWAY, OFFLINE)).toBe('online');
  });

  it('caches the manual away preference and the last emitted status', () => {
    const store = new InProcessPresenceStore();
    expect(store.manualAwayOf('u1')).toBeUndefined();
    expect(store.lastEmitted('u1')).toBeUndefined();

    store.setManualAway('u1', false);
    store.markEmitted('u1', 'online');

    expect(store.manualAwayOf('u1')).toBe(false);
    expect(store.lastEmitted('u1')).toBe('online');
  });

  it('prunes expired records but keeps a user whose last emitted status is not offline', () => {
    const store = new InProcessPresenceStore();
    store.heartbeat('u1', 'c1', false);
    store.markEmitted('u1', 'online');
    vi.advanceTimersByTime(16000);

    store.prune(OFFLINE);
    expect(store.userIds()).toEqual(['u1']);
    expect(store.statusOf('u1', AWAY, OFFLINE)).toBe('offline');

    store.markEmitted('u1', 'offline');
    store.prune(OFFLINE);
    expect(store.userIds()).toEqual([]);
  });

  it('keeps fresh records and users with a fresh client when pruning', () => {
    const store = new InProcessPresenceStore();
    store.heartbeat('u1', 'old', false);
    vi.advanceTimersByTime(10000);
    store.heartbeat('u1', 'new', false);
    vi.advanceTimersByTime(6000);

    store.prune(OFFLINE);

    expect(store.userIds()).toEqual(['u1']);
    expect(store.statusOf('u1', AWAY, OFFLINE)).toBe('away');
  });
});
