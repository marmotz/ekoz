import type { Capability } from './capabilities.js';

export type RoomRole = 'space_admin' | 'room_admin' | 'moderator' | 'member' | 'reader';

/**
 * Relative authority order, highest first (technical.md §9: "cannot set a
 * role above the caller's own effective authority"). Not a capability itself
 * — `MembershipService` compares ranks directly on a role change.
 */
export const ROLE_RANK: Readonly<Record<RoomRole, number>> = {
  space_admin: 4,
  room_admin: 3,
  moderator: 2,
  member: 1,
  reader: 0,
};

/**
 * Default capability matrix (technical.md §6), seeded into
 * `role_default_capability`. Only `allow` rows are listed — an absent
 * (role, capability) pair resolves to `deny` (permission-model.md), so this is
 * the full ✓ column of the table, nothing else.
 *
 * `room.invite` for `member` is deliberately absent here: technical.md notes
 * it is "on by default only for `dm`/`group_dm` and public channels", a
 * per-room-type condition this table (role × capability only) cannot express.
 * It is granted per room via `RoomPermissionOverride` by the feature that
 * creates those rooms (#4, #5), not seeded globally.
 */
export const ROLE_DEFAULT_CAPABILITIES: ReadonlyArray<{ role: RoomRole; capability: Capability }> =
  [
    // space_admin: every capability.
    ...(
      [
        'room.read',
        'room.post',
        'room.edit_own',
        'room.delete_own',
        'room.react',
        'room.edit_any',
        'room.delete_any',
        'room.kick',
        'room.ban',
        'room.invite',
        'room.pin',
        'room.attach',
        'room.manage_members',
        'room.manage_roles',
        'room.manage_permissions',
        'room.manage_retention',
        'room.manage_groups',
        'space.create_child',
        'space.manage',
        'directory.publish',
      ] as const
    ).map((capability) => ({ role: 'space_admin' as const, capability })),

    // room_admin: everything but the space-scoped capabilities.
    ...(
      [
        'room.read',
        'room.post',
        'room.edit_own',
        'room.delete_own',
        'room.react',
        'room.edit_any',
        'room.delete_any',
        'room.kick',
        'room.ban',
        'room.invite',
        'room.pin',
        'room.attach',
        'room.manage_members',
        'room.manage_roles',
        'room.manage_permissions',
        'room.manage_retention',
        'room.manage_groups',
        'directory.publish',
      ] as const
    ).map((capability) => ({ role: 'room_admin' as const, capability })),

    // moderator: day-to-day moderation, no role/permission/retention management.
    ...(
      [
        'room.read',
        'room.post',
        'room.edit_own',
        'room.delete_own',
        'room.react',
        'room.delete_any',
        'room.kick',
        'room.ban',
        'room.invite',
        'room.pin',
        'room.attach',
        'room.manage_members',
      ] as const
    ).map((capability) => ({ role: 'moderator' as const, capability })),

    // member: participate, no moderation.
    ...(
      [
        'room.read',
        'room.post',
        'room.edit_own',
        'room.delete_own',
        'room.react',
        'room.attach',
      ] as const
    ).map((capability) => ({ role: 'member' as const, capability })),

    // reader: read-only.
    { role: 'reader' as const, capability: 'room.read' as const },
  ];
