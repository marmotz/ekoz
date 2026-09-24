import { createFileRoute } from '@tanstack/react-router';

import { RoomsWelcomePage } from '@/features/rooms/routes/rooms-welcome-page';

export const Route = createFileRoute('/_app/rooms/')({
  staticData: { title: 'rooms.title' },
  component: RoomsWelcomePage,
});
