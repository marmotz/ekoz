import type { RoomListItem } from '@ekozhq/sdk';

/** A `GET /rooms` item: a `member` channel unless `overrides` says otherwise. */
export function roomItem(overrides: Partial<RoomListItem> & { id: string }): RoomListItem {
  return {
    type: 'channel',
    parentId: null,
    visibility: 'private',
    slug: null,
    name: overrides.id,
    topic: null,
    avatarBlobId: null,
    defaultRole: 'member',
    readOnly: false,
    originServer: 'example.test',
    lastSeq: '0',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    role: 'member',
    access: 'member',
    unreadCount: 0,
    ...overrides,
  };
}
