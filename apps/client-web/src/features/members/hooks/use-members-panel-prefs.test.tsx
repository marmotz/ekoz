import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';

import {
  MEMBERS_PANEL_STORAGE_KEY,
  reloadMembersPanelPrefs,
  useMembersPanelPrefs,
} from '@/features/members/hooks/use-members-panel-prefs';

beforeEach(() => {
  window.localStorage.clear();
  reloadMembersPanelPrefs();
});

it('defaults to a closed panel grouped by role', () => {
  const { result } = renderHook(() => useMembersPanelPrefs());

  expect(result.current.open).toBe(false);
  expect(result.current.view).toBe('role');
});

it('persists the open state and the view in localStorage', () => {
  const { result } = renderHook(() => useMembersPanelPrefs());

  act(() => result.current.toggle());
  act(() => result.current.setView('alpha'));

  expect(result.current).toMatchObject({ open: true, view: 'alpha' });
  expect(JSON.parse(window.localStorage.getItem(MEMBERS_PANEL_STORAGE_KEY) ?? '')).toEqual({
    open: true,
    view: 'alpha',
  });

  act(() => result.current.setOpen(false));
  expect(result.current.open).toBe(false);
});

it('restores the stored preferences', () => {
  window.localStorage.setItem(
    MEMBERS_PANEL_STORAGE_KEY,
    JSON.stringify({ open: true, view: 'alpha' }),
  );
  reloadMembersPanelPrefs();

  const { result } = renderHook(() => useMembersPanelPrefs());

  expect(result.current).toMatchObject({ open: true, view: 'alpha' });
});

it('falls back to the defaults on unreadable or invalid stored values', () => {
  window.localStorage.setItem(MEMBERS_PANEL_STORAGE_KEY, '{not json');
  reloadMembersPanelPrefs();
  expect(renderHook(() => useMembersPanelPrefs()).result.current).toMatchObject({
    open: false,
    view: 'role',
  });

  window.localStorage.setItem(
    MEMBERS_PANEL_STORAGE_KEY,
    JSON.stringify({ open: 'yes', view: 'x' }),
  );
  reloadMembersPanelPrefs();
  expect(renderHook(() => useMembersPanelPrefs()).result.current).toMatchObject({
    open: false,
    view: 'role',
  });
});

it('keeps every consumer in sync', () => {
  const first = renderHook(() => useMembersPanelPrefs());
  const second = renderHook(() => useMembersPanelPrefs());

  act(() => first.result.current.toggle());

  expect(second.result.current.open).toBe(true);
});

it('still works when the storage refuses writes', () => {
  const original = Storage.prototype.setItem;
  window.localStorage.setItem = () => {
    throw new Error('quota');
  };
  try {
    const { result } = renderHook(() => useMembersPanelPrefs());

    act(() => result.current.toggle());

    expect(result.current.open).toBe(true);
  } finally {
    window.localStorage.setItem = original;
  }
});
