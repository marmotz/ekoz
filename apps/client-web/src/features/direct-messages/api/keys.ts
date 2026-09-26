/** Query keys of the direct messages feature (web-client-direct-messages technical design 4.1). */
export const conversationKeys = {
  all: ['conversations'] as const,
  list: () => ['conversations', 'list'] as const,
  /** `GET /rooms/:id`, the fallback of the gate when the list does not know the conversation. */
  room: (roomId: string) => ['conversations', 'room', roomId] as const,
  permissions: (roomId: string) => ['conversations', 'permissions', roomId] as const,
  contacts: (query: string) => ['conversations', 'contacts', query] as const,
  profile: (identifier: string) => ['conversations', 'profile', identifier] as const,
};
