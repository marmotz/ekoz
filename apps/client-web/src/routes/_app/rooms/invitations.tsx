import { createFileRoute } from '@tanstack/react-router';

import { InvitationList } from '@/features/rooms/components/invitation-list';

export const Route = createFileRoute('/_app/rooms/invitations')({
  staticData: { title: 'rooms.invitations.title' },
  component: InvitationList,
});
