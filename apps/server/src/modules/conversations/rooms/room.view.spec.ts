import { describe, expect, it } from 'vitest';
import { RoomListItemSchema, toPreviewJoinRequest, toRoomListItem } from './room.view.js';

const row = (approved: boolean | null) => ({
  id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  createdAt: '2026-09-21T10:00:00.000Z',
  approved,
});

describe('toPreviewJoinRequest', () => {
  it('has no join request to show when there is none', () => {
    expect(toPreviewJoinRequest(null)).toBeNull();
  });

  it('maps an unresolved request to pending', () => {
    expect(toPreviewJoinRequest(row(null))).toEqual({
      id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      createdAt: '2026-09-21T10:00:00.000Z',
      status: 'pending',
    });
  });

  it('maps a refused request to rejected', () => {
    expect(toPreviewJoinRequest(row(false))).toMatchObject({ status: 'rejected' });
  });

  it('hides an approved request', () => {
    expect(toPreviewJoinRequest(row(true))).toBeNull();
  });
});

describe('toRoomListItem', () => {
  const listRow = {
    id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    type: 'channel' as const,
    parentId: '01ARZ3NDEKTSV4RRFFQ69G5FAW',
    visibility: 'private' as const,
    slug: null,
    name: 'general',
    topic: null,
    avatarBlobId: null,
    defaultRole: 'member' as const,
    readOnly: false,
    originServer: 'ekoz.example.com',
    lastSeq: 12n,
    createdAt: '2026-09-21T10:00:00.000Z',
    updatedAt: '2026-09-21T10:00:00.000Z',
  };

  it('serialises the room and keeps the role and access', () => {
    const item = toRoomListItem({ ...listRow, role: 'moderator', access: 'inherited' });

    expect(item).toMatchObject({ lastSeq: '12', role: 'moderator', access: 'inherited' });
    expect(item).not.toHaveProperty('deletedAt');
    expect(RoomListItemSchema.parse(item)).toEqual(item);
  });

  it('allows a null role for a context room', () => {
    const item = toRoomListItem({ ...listRow, type: 'space', role: null, access: 'context' });

    expect(RoomListItemSchema.parse(item)).toMatchObject({ role: null, access: 'context' });
  });
});
