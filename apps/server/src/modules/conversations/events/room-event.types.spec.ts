import { describe, expect, it } from 'vitest';
import { ROOM_EVENT_PAYLOAD_SCHEMAS } from './room-event.types.js';

describe('ROOM_EVENT_PAYLOAD_SCHEMAS (unit)', () => {
  it('accepts a valid room_created payload', () => {
    const result = ROOM_EVENT_PAYLOAD_SCHEMAS.room_created.safeParse({
      type: 'channel',
      parentId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      visibility: 'public',
      name: 'general',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a room_created payload missing required fields', () => {
    expect(ROOM_EVENT_PAYLOAD_SCHEMAS.room_created.safeParse({}).success).toBe(false);
  });

  it('accepts a partial room_updated payload', () => {
    expect(ROOM_EVENT_PAYLOAD_SCHEMAS.room_updated.safeParse({ name: 'renamed' }).success).toBe(
      true,
    );
    expect(ROOM_EVENT_PAYLOAD_SCHEMAS.room_updated.safeParse({}).success).toBe(true);
  });

  it('rejects an invalid enum value in room_updated', () => {
    expect(ROOM_EVENT_PAYLOAD_SCHEMAS.room_updated.safeParse({ visibility: 'nope' }).success).toBe(
      false,
    );
  });

  it('accepts a room_moved payload with nullable parent ids', () => {
    const result = ROOM_EVENT_PAYLOAD_SCHEMAS.room_moved.safeParse({
      oldParentId: null,
      newParentId: 'x',
    });
    expect(result.success).toBe(true);
  });

  it('accepts an empty room_deleted payload', () => {
    expect(ROOM_EVENT_PAYLOAD_SCHEMAS.room_deleted.safeParse({}).success).toBe(true);
  });

  it('accepts a role-scoped permission_override_changed payload', () => {
    const result = ROOM_EVENT_PAYLOAD_SCHEMAS.permission_override_changed.safeParse({
      scope: 'role',
      role: 'member',
      capability: 'room.pin',
      effect: 'allow',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a user-scoped permission_override_changed payload', () => {
    const result = ROOM_EVENT_PAYLOAD_SCHEMAS.permission_override_changed.safeParse({
      scope: 'user',
      userId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      capability: 'room.pin',
      effect: 'deny',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a permission_override_changed payload mixing scope fields', () => {
    // `userId` on a role-scoped payload (and vice versa) — the discriminated
    // union must reject the wrong branch's shape, not just check `scope`.
    expect(
      ROOM_EVENT_PAYLOAD_SCHEMAS.permission_override_changed.safeParse({
        scope: 'role',
        userId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
        capability: 'room.pin',
        effect: 'allow',
      }).success,
    ).toBe(false);
  });

  it('rejects an unknown capability in permission_override_changed', () => {
    expect(
      ROOM_EVENT_PAYLOAD_SCHEMAS.permission_override_changed.safeParse({
        scope: 'role',
        role: 'member',
        capability: 'room.nope',
        effect: 'allow',
      }).success,
    ).toBe(false);
  });

  it('accepts a message_hidden payload', () => {
    expect(
      ROOM_EVENT_PAYLOAD_SCHEMAS.message_hidden.safeParse({
        messageId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      }).success,
    ).toBe(true);
  });

  it('rejects a message_hidden payload missing messageId', () => {
    expect(ROOM_EVENT_PAYLOAD_SCHEMAS.message_hidden.safeParse({}).success).toBe(false);
  });

  it('accepts a retention_changed payload for each rule mode', () => {
    expect(
      ROOM_EVENT_PAYLOAD_SCHEMAS.retention_changed.safeParse({ rule: { mode: 'inherit' } }).success,
    ).toBe(true);
    expect(
      ROOM_EVENT_PAYLOAD_SCHEMAS.retention_changed.safeParse({ rule: { mode: 'keep' } }).success,
    ).toBe(true);
    expect(
      ROOM_EVENT_PAYLOAD_SCHEMAS.retention_changed.safeParse({
        rule: { mode: 'hide', after: 3600 },
      }).success,
    ).toBe(true);
  });

  it('rejects a retention_changed payload with a rule missing after', () => {
    expect(
      ROOM_EVENT_PAYLOAD_SCHEMAS.retention_changed.safeParse({ rule: { mode: 'delete' } }).success,
    ).toBe(false);
  });
});
