import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';

import {
  getActiveRoom,
  markSeen,
  markUnseen,
  resetUnseenRooms,
  setActiveRoom,
  useRoomHasUnseen,
} from '@/shared/realtime/unseen-rooms';

beforeEach(() => {
  resetUnseenRooms();
});

it('flags a room as unseen until it is marked seen', () => {
  const { result } = renderHook(() => useRoomHasUnseen('r1'));
  expect(result.current).toBe(false);

  act(() => markUnseen('r1'));
  expect(result.current).toBe(true);

  act(() => markSeen('r1'));
  expect(result.current).toBe(false);
});

it('only notifies the room it concerns', () => {
  const other = renderHook(() => useRoomHasUnseen('r2'));

  act(() => markUnseen('r1'));

  expect(other.result.current).toBe(false);
});

it('clears the unseen dot of a room when it becomes the active one', () => {
  const { result } = renderHook(() => useRoomHasUnseen('r1'));
  act(() => markUnseen('r1'));

  act(() => setActiveRoom('r1'));

  expect(getActiveRoom()).toBe('r1');
  expect(result.current).toBe(false);

  act(() => setActiveRoom(null));
  expect(getActiveRoom()).toBeNull();
});

it('forgets everything on reset', () => {
  const { result } = renderHook(() => useRoomHasUnseen('r1'));
  act(() => {
    markUnseen('r1');
    setActiveRoom('r2');
  });

  act(() => resetUnseenRooms());

  expect(result.current).toBe(false);
  expect(getActiveRoom()).toBeNull();
});
