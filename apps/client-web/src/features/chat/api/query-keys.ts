export const chatKeys = {
  timeline: (roomId: string) => ['chat', 'timeline', roomId] as const,
  receipts: (roomId: string) => ['chat', 'receipts', roomId] as const,
};
