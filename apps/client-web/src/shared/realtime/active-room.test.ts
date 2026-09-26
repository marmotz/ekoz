import { beforeEach, expect, it } from 'vitest';

import {
  getActiveRoom,
  getReadingRoom,
  resetActiveRooms,
  setActiveRoom,
  setReadingRoom,
} from '@/shared/realtime/active-room';

beforeEach(() => {
  resetActiveRooms();
});

it('starts with no active and no reading room', () => {
  expect(getActiveRoom()).toBeNull();
  expect(getReadingRoom()).toBeNull();
});

it('tracks the active room', () => {
  setActiveRoom('r1');
  expect(getActiveRoom()).toBe('r1');

  setActiveRoom(null);
  expect(getActiveRoom()).toBeNull();
});

it('tracks the reading room independently of the active one', () => {
  setActiveRoom('r1');
  setReadingRoom('r2');

  expect(getActiveRoom()).toBe('r1');
  expect(getReadingRoom()).toBe('r2');

  setReadingRoom(null);
  expect(getReadingRoom()).toBeNull();
  expect(getActiveRoom()).toBe('r1');
});

it('forgets both rooms on reset', () => {
  setActiveRoom('r1');
  setReadingRoom('r1');

  resetActiveRooms();

  expect(getActiveRoom()).toBeNull();
  expect(getReadingRoom()).toBeNull();
});
