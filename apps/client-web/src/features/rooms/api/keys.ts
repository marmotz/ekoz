/** Query keys of the rooms feature (web-client-rooms technical design 4.5). */
export const roomKeys = {
  all: ['rooms'] as const,
  list: () => ['rooms', 'list'] as const,
  detail: (roomId: string) => ['rooms', 'detail', roomId] as const,
  preview: (roomId: string) => ['rooms', 'preview', roomId] as const,
  permissions: (roomId: string) => ['rooms', 'permissions', roomId] as const,
  directory: (query: string) => ['rooms', 'directory', query] as const,
  invitations: () => ['rooms', 'invitations'] as const,
  joinRequests: (roomId: string) => ['rooms', 'join-requests', roomId] as const,
};
