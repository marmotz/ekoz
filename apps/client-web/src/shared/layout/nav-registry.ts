import type { ParseKeys } from 'i18next';
import type { LucideIcon } from 'lucide-react';

export interface NavEntry {
  /** Unique key: registering the same id twice keeps the first entry. */
  id: string;
  /** Route path the entry links to. */
  to: string;
  /** Translation key of the label. */
  labelKey: ParseKeys;
  icon?: LucideIcon;
  /** Ascending sort key; entries without one go last. */
  order?: number;
}

const entries: NavEntry[] = [];

/**
 * Features register their navigation entries from their entry point; the shell
 * reads them here, so neither imports the other.
 */
export function registerNav(entry: NavEntry): void {
  if (entries.some((existing) => existing.id === entry.id)) return;
  entries.push(entry);
}

export function getNavEntries(): readonly NavEntry[] {
  return [...entries].sort(
    (a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER),
  );
}

/** Test helper: empties the registry. */
export function clearNavRegistry(): void {
  entries.length = 0;
}
