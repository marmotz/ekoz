export const chatKeys = {
  timeline: (roomId: string) => ['chat', 'timeline', roomId] as const,
  messagesPolicy: () => ['chat', 'messages-policy'] as const,
  receipts: (roomId: string) => ['chat', 'receipts', roomId] as const,
};
