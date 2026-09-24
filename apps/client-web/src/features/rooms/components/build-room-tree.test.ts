import { describe, expect, it } from 'vitest';

import { buildRoomTree, type RoomNode } from '@/features/rooms/components/build-room-tree';
import { roomItem } from '../../../../test/room-fixtures';

/** The tree as `[id, [children]]` pairs, for readable assertions. */
function shape(nodes: RoomNode[]): unknown[] {
  return nodes.map(({ room, children }) => [room.id, shape(children)]);
}

describe('buildRoomTree', () => {
  it('returns an empty forest for an empty list', () => {
    expect(buildRoomTree([])).toEqual([]);
  });

  it('places inherited children under a context header', () => {
    const tree = buildRoomTree([
      roomItem({ id: 'org', type: 'space', access: 'context', role: null }),
      roomItem({ id: 'team', type: 'space', parentId: 'org', access: 'member' }),
      roomItem({ id: 'general', parentId: 'team', access: 'inherited', role: null }),
    ]);

    expect(shape(tree)).toEqual([['org', [['team', [['general', []]]]]]]);
    expect(tree[0]?.room.access).toBe('context');
    expect(tree[0]?.children[0]?.children[0]?.room.access).toBe('inherited');
  });

  it('makes a root of a channel whose parent is not in the list', () => {
    const tree = buildRoomTree([
      roomItem({ id: 'ctx', type: 'space', access: 'context' }),
      roomItem({ id: 'orphan', parentId: 'hidden-space' }),
      roomItem({ id: 'child', parentId: 'ctx' }),
    ]);

    expect(shape(tree)).toEqual([
      ['ctx', [['child', []]]],
      ['orphan', []],
    ]);
  });

  it('keeps the server order among siblings and roots', () => {
    const tree = buildRoomTree([
      roomItem({ id: 'b-space', type: 'space' }),
      roomItem({ id: 'z', parentId: 'b-space' }),
      roomItem({ id: 'a-space', type: 'space' }),
      roomItem({ id: 'a', parentId: 'b-space' }),
      roomItem({ id: 'm', parentId: 'b-space' }),
    ]);

    expect(shape(tree)).toEqual([
      [
        'b-space',
        [
          ['z', []],
          ['a', []],
          ['m', []],
        ],
      ],
      ['a-space', []],
    ]);
  });

  it('lists a child after its parent even when the server sends it first', () => {
    const tree = buildRoomTree([
      roomItem({ id: 'child', parentId: 'space' }),
      roomItem({ id: 'space', type: 'space' }),
    ]);

    expect(shape(tree)).toEqual([['space', [['child', []]]]]);
  });

  it('does not loop on a malformed parent cycle', () => {
    const tree = buildRoomTree([
      roomItem({ id: 'self', parentId: 'self' }),
      roomItem({ id: 'a', parentId: 'b' }),
      roomItem({ id: 'b', parentId: 'a' }),
    ]);

    expect(shape(tree)).toEqual([['self', []]]);
  });
});
