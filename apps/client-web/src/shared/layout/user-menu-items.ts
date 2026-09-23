import type { ParseKeys } from 'i18next';
import type { LucideIcon } from 'lucide-react';

export interface UserMenuItem {
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

const items: UserMenuItem[] = [];

/**
 * Features register their user menu entries from their route module; the menu
 * (owned by `auth`) reads them here, so neither imports the other.
 */
export function registerUserMenuItem(item: UserMenuItem): void {
  if (items.some((existing) => existing.id === item.id)) return;
  items.push(item);
}

export function getUserMenuItems(): readonly UserMenuItem[] {
  return [...items].sort(
    (a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER),
  );
}

/** Test helper: empties the registry. */
export function clearUserMenuItems(): void {
  items.length = 0;
}
