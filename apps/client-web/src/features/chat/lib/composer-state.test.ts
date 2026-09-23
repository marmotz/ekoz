import { expect, it } from 'vitest';

import { composerBlock } from '@/features/chat/lib/composer-state';

const open = { id: 'r1', readOnly: false };
const readOnly = { id: 'r1', readOnly: true };

it('lets a member with room.post write in an open room', () => {
  expect(composerBlock(open, ['room.read', 'room.post'], 'member')).toBeNull();
});

it('requires membership even when the capabilities would allow posting', () => {
  expect(composerBlock(open, ['room.read', 'room.post'], 'invited')).toBe('join');
  expect(composerBlock(open, ['room.read', 'room.post'], 'joinable')).toBe('join');
});

it('requires room.post', () => {
  expect(composerBlock(open, ['room.read'], 'member')).toBe('permission');
});

it('blocks a read-only room unless the caller has room.edit_any', () => {
  expect(composerBlock(readOnly, ['room.post'], 'member')).toBe('read_only');
  expect(composerBlock(readOnly, ['room.post', 'room.edit_any'], 'member')).toBeNull();
});
