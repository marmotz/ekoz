import { createFileRoute } from '@tanstack/react-router';

import { CreateRoomForm } from '@/features/rooms/components/create-room-form';

export const Route = createFileRoute('/_app/rooms/new')({
  staticData: { title: 'rooms.create.title' },
  component: CreateRoomForm,
});
