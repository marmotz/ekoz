import { createFileRoute, Outlet } from '@tanstack/react-router';

import { SidebarRooms } from '@/features/rooms/components/sidebar-rooms';
import { registerSidebarSection } from '@/shared/layout/sidebar-section-registry';

registerSidebarSection({ id: 'rooms', order: 10, component: SidebarRooms });

/**
 * Layout of every `/rooms/*` page. Its import registers the rooms tree in the sidebar,
 * as `index.tsx` registers the Home entry. `RequireAuth` comes from the `_app` layout.
 */
export const Route = createFileRoute('/_app/rooms')({
  staticData: { title: 'rooms.title' },
  component: Outlet,
});
