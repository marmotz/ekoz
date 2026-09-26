import type { RoomListItem } from '@ekozhq/sdk';

export interface RoomNode {
  room: RoomListItem;
  children: RoomNode[];
  /** Sum of the `unreadCount` of every descendant, `null` counting as 0. */
  descendantsUnread: number;
}

/**
 * The caller's rooms as a forest (technical design 4.4). Items are grouped by
 * `parentId`; a root is an item whose parent is absent from the list (a root space,
 * or a room whose ancestors the caller cannot see). Siblings keep the server order.
 * Each node carries the unread sum of its descendants, shown on a collapsed space.
 */
export function buildRoomTree(items: readonly RoomListItem[]): RoomNode[] {
  const ids = new Set(items.map((item) => item.id));
  const childrenOf = new Map<string, RoomListItem[]>();
  const roots: RoomListItem[] = [];

  for (const item of items) {
    if (item.parentId !== null && ids.has(item.parentId) && item.parentId !== item.id) {
      const siblings = childrenOf.get(item.parentId) ?? [];
      siblings.push(item);
      childrenOf.set(item.parentId, siblings);
    } else {
      roots.push(item);
    }
  }

  // `visited` guards against a malformed list with a parent cycle.
  const visited = new Set<string>();
  const toNode = (room: RoomListItem): RoomNode => {
    visited.add(room.id);
    const children = (childrenOf.get(room.id) ?? [])
      .filter((child) => !visited.has(child.id))
      .map(toNode);
    const descendantsUnread = children.reduce(
      (sum, child) => sum + (child.room.unreadCount ?? 0) + child.descendantsUnread,
      0,
    );
    return { room, children, descendantsUnread };
  };

  return roots.map(toNode);
}
