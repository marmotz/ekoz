import type { ParseKeys } from 'i18next';
import type { LucideIcon } from 'lucide-react';
import type { ComponentType } from 'react';

interface UserMenuEntryBase {
  /** Unique key: registering the same id twice keeps the first entry. */
  id: string;
  /** Ascending sort key; entries without one go last. */
  order?: number;
}

/** An entry that links to a route. */
export interface UserMenuLinkItem extends UserMenuEntryBase {
  /** Route path the entry links to. */
  to: string;
  /** Translation key of the label. */
  labelKey: ParseKeys;
  icon?: LucideIcon;
}

/** An entry that renders itself (a dropdown menu item), for actions that are not links. */
export interface UserMenuComponentItem extends UserMenuEntryBase {
  Component: ComponentType;
}

export type UserMenuItem = UserMenuLinkItem | UserMenuComponentItem;

export function isComponentItem(item: UserMenuItem): item is UserMenuComponentItem {
  return 'Component' in item;
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
