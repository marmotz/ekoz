import { useCallback, useSyncExternalStore } from 'react';

import type { MembersView } from '@/features/members/lib/group-members';

export const MEMBERS_PANEL_STORAGE_KEY = 'ekoz.members.panel';

export interface MembersPanelPrefs {
  open: boolean;
  view: MembersView;
}

const DEFAULTS: MembersPanelPrefs = { open: false, view: 'role' };

function read(): MembersPanelPrefs {
  try {
    const stored = JSON.parse(window.localStorage.getItem(MEMBERS_PANEL_STORAGE_KEY) ?? 'null');
    return {
      open: typeof stored?.open === 'boolean' ? stored.open : DEFAULTS.open,
      view: stored?.view === 'alpha' || stored?.view === 'role' ? stored.view : DEFAULTS.view,
    };
  } catch {
    return DEFAULTS;
  }
}

function write(prefs: MembersPanelPrefs): void {
  try {
    window.localStorage.setItem(MEMBERS_PANEL_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Storage unavailable: the choice just will not survive a reload.
  }
}

// One store shared by the toggle and the panel, so they stay in sync.
let state: MembersPanelPrefs | null = null;
const listeners = new Set<() => void>();

function getSnapshot(): MembersPanelPrefs {
  state ??= read();
  return state;
}

function update(patch: Partial<MembersPanelPrefs>): void {
  state = { ...getSnapshot(), ...patch };
  write(state);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Forgets the in-memory state so the next read comes from `localStorage` (for tests). */
export function reloadMembersPanelPrefs(): void {
  state = null;
  for (const listener of listeners) listener();
}

/**
 * Whether the members panel is open and how it lists people, persisted in
 * `localStorage`. Defaults: closed, grouped by role.
 */
export function useMembersPanelPrefs() {
  const prefs = useSyncExternalStore(subscribe, getSnapshot, () => DEFAULTS);

  const setOpen = useCallback((open: boolean) => update({ open }), []);
  const toggle = useCallback(() => update({ open: !getSnapshot().open }), []);
  const setView = useCallback((view: MembersView) => update({ view }), []);

  return { ...prefs, setOpen, toggle, setView };
}
