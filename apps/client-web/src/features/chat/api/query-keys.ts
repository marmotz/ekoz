export const chatKeys = {
  timeline: (roomId: string) => ['chat', 'timeline', roomId] as const,
  messagesPolicy: () => ['chat', 'messages-policy'] as const,
  receipts: (roomId: string) => ['chat', 'receipts', roomId] as const,
  message: (roomId: string, messageId: string) => ['chat', 'message', roomId, messageId] as const,
  pins: (roomId: string) => ['chat', 'pins', roomId] as const,
};
