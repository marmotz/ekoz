import { createFileRoute } from '@tanstack/react-router';

import { DirectoryList } from '@/features/rooms/components/directory-list';

export const Route = createFileRoute('/_app/rooms/directory')({
  staticData: { title: 'rooms.directory.title' },
  component: DirectoryList,
});
