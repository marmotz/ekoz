/**
 * Closed, protocol-versioned capability set (technical.md §6,
 * permission-model.md). Grows only additively.
 */
export const CAPABILITIES = [
  'room.read',
  'room.post',
  'room.edit_own',
  'room.delete_own',
  'room.edit_any',
  'room.delete_any',
  'room.react',
  'room.pin',
  'room.attach',
  'room.invite',
  'room.kick',
  'room.ban',
  'room.manage_members',
  'room.manage_roles',
  'room.manage_permissions',
  'room.manage_retention',
  'room.manage_groups',
  'space.create_child',
  'space.manage',
  'directory.publish',
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export function isCapability(value: string): value is Capability {
  return (CAPABILITIES as readonly string[]).includes(value);
}
