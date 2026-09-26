import type { ConversationListItem } from '@ekozhq/sdk';

type Participant = ConversationListItem['participants'][number];

/** A conversation participant: `name` doubles as the display name and the identifier prefix. */
export function participant(
  id: string,
  name: string,
  { isAdmin = false }: { isAdmin?: boolean } = {},
): Participant {
  return {
    user: {
      id,
      identifier: `${name.toLowerCase()}/example.test`,
      displayName: name,
      avatarUrl: null,
    },
    isAdmin,
  };
}

/** A `GET /me/conversations` item: a `dm` unless `overrides` says otherwise. */
export function conversationItem(
  overrides: Partial<ConversationListItem> & { id: string },
): ConversationListItem {
  return {
    type: 'dm',
    parentId: null,
    visibility: 'private',
    slug: null,
    name: null,
    topic: null,
    avatarBlobId: null,
    defaultRole: 'member',
    readOnly: false,
    originServer: 'example.test',
    lastSeq: '0',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    lastActivityAt: new Date('2026-01-01T00:00:00Z'),
    participants: [],
    isAdmin: false,
    ...overrides,
  };
}
