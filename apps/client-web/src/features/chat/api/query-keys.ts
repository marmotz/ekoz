export const chatKeys = {
  timeline: (roomId: string) => ['chat', 'timeline', roomId] as const,
  members: (roomId: string) => ['chat', 'members', roomId] as const,
};
