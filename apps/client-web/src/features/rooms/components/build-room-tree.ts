import type { RoomListItem } from '@ekozhq/sdk';

export interface RoomNode {
  room: RoomListItem;
  children: RoomNode[];
}

/**
 * The caller's rooms as a forest (technical design 4.4). Items are grouped by
 * `parentId`; a root is an item whose parent is absent from the list (a root space,
 * or a room whose ancestors the caller cannot see). Siblings keep the server order.
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
    return {
      room,
      children: (childrenOf.get(room.id) ?? [])
        .filter((child) => !visited.has(child.id))
        .map(toNode),
    };
  };

  return roots.map(toNode);
}
