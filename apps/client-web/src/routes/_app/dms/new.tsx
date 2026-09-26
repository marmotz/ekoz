import { createFileRoute } from '@tanstack/react-router';

import { NewConversationPage } from '@/features/direct-messages/components/new-conversation-page';

export const Route = createFileRoute('/_app/dms/new')({
  staticData: { title: 'directMessages.new.title' },
  component: NewConversationPage,
});
