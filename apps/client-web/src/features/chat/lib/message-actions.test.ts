import { describe, expect, it } from 'vitest';

import {
  type AvailableActionsInput,
  availableActions,
  insideEditWindow,
} from '@/features/chat/lib/message-actions';
import type { TimelineMessage } from '@/features/chat/lib/timeline';

const NOW = Date.parse('2026-01-01T10:10:00.000Z');

const message: TimelineMessage = {
  id: 'm1',
  roomId: 'r1',
  seq: '1',
  authorId: 'me',
  body: 'hello',
  replyToId: null,
  mentions: [],
  mentionsMe: null,
  editedAt: null,
  redactedAt: null,
  hiddenAt: null,
  createdAt: '2026-01-01T10:00:00.000Z',
  reactions: [],
};

function actions(overrides: Partial<AvailableActionsInput> = {}) {
  return availableActions({
    message,
    myId: 'me',
    capabilities: [],
    editWindow: null,
    now: NOW,
    canPost: true,
    ...overrides,
  });
}

describe('availableActions', () => {
  it('offers only reply when the caller has no capability but can post', () => {
    expect(actions()).toEqual(['reply']);
  });

  it('offers nothing for a redacted, hidden message', () => {
    const capabilities = ['room.react', 'room.edit_any', 'room.delete_any', 'room.pin'];

    expect(
      actions({ capabilities, message: { ...message, redactedAt: '2026-01-01T10:05:00Z' } }),
    ).toEqual([]);
    expect(
      actions({ capabilities, message: { ...message, hiddenAt: '2026-01-01T10:05:00Z' } }),
    ).toEqual([]);
  });

  it('drops reply while the composer is blocked', () => {
    expect(actions({ canPost: false })).toEqual([]);
  });

  it('offers react with room.react', () => {
    expect(actions({ capabilities: ['room.react'] })).toEqual(['reply', 'react']);
  });

  it('lets the author edit and delete their own message with the own capabilities', () => {
    expect(actions({ capabilities: ['room.edit_own', 'room.delete_own'] })).toEqual([
      'reply',
      'edit',
      'delete',
    ]);
  });

  it('does not let a member edit or delete the message of someone else with the own capabilities', () => {
    expect(
      actions({ capabilities: ['room.edit_own', 'room.delete_own'], myId: 'someone-else' }),
    ).toEqual(['reply']);
  });

  it('lets a moderator edit and delete any message', () => {
    expect(
      actions({ capabilities: ['room.edit_any', 'room.delete_any'], myId: 'someone-else' }),
    ).toEqual(['reply', 'edit', 'delete']);
  });

  it('does not know the author while the account is loading', () => {
    expect(actions({ capabilities: ['room.edit_own', 'room.delete_own'], myId: null })).toEqual([
      'reply',
    ]);
  });

  it('hides edit outside the edit window, but not delete', () => {
    const capabilities = ['room.edit_own', 'room.delete_own'];

    expect(actions({ capabilities, editWindow: 900 })).toEqual(['reply', 'edit', 'delete']);
    expect(actions({ capabilities, editWindow: 300 })).toEqual(['reply', 'delete']);
  });

  it('keeps edit outside the window for room.edit_any', () => {
    expect(actions({ capabilities: ['room.edit_any'], editWindow: 60 })).toEqual(['reply', 'edit']);
  });

  it('offers pin or unpin from whether the message is pinned', () => {
    expect(actions({ capabilities: ['room.pin'] })).toEqual(['reply', 'pin']);
    expect(actions({ capabilities: ['room.pin'], pinned: true })).toEqual(['reply', 'unpin']);
  });

  it('lists the actions in menu order', () => {
    expect(
      actions({
        capabilities: ['room.react', 'room.edit_own', 'room.delete_own', 'room.pin'],
      }),
    ).toEqual(['reply', 'react', 'edit', 'pin', 'delete']);
  });
});

describe('insideEditWindow', () => {
  it('is always true without a window, including while the policy is unknown', () => {
    expect(insideEditWindow(message.createdAt, null, NOW)).toBe(true);
    expect(insideEditWindow(message.createdAt, undefined, NOW)).toBe(true);
  });

  it('includes the exact end of the window', () => {
    expect(insideEditWindow(message.createdAt, 600, NOW)).toBe(true);
    expect(insideEditWindow(message.createdAt, 599, NOW)).toBe(false);
  });

  it('leaves the decision to the server on an unreadable date', () => {
    expect(insideEditWindow('not a date', 1, NOW)).toBe(true);
  });
});
