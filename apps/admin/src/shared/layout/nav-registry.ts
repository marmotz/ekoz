import type { ComponentType } from 'react';

export interface NavEntry {
  /** Unique key; also used to keep insertion order stable across registrations. */
  id: string;
  to: string;
  labelKey: string;
  icon: ComponentType<{ className?: string }>;
}

const entries: NavEntry[] = [];

/** Lets each feature register its own sidebar entry — no cross-feature imports (technical.md §5). */
export function registerNav(entry: NavEntry): void {
  if (entries.some((existing) => existing.id === entry.id)) return;
  entries.push(entry);
}

export function getNavEntries(): readonly NavEntry[] {
  return entries;
}
