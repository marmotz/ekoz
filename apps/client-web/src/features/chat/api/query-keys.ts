export const chatKeys = {
  timeline: (roomId: string) => ['chat', 'timeline', roomId] as const,
};
