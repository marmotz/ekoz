import { expect, it } from 'vitest';

import { SidebarRooms } from '@/features/rooms/components/sidebar-rooms';
import { RoomsWelcomePage } from '@/features/rooms/routes/rooms-welcome-page';
import { Route as RoomsLayout } from '@/routes/_app/rooms';
import { Route as RoomsIndex } from '@/routes/_app/rooms/index';
import { getSidebarSections } from '@/shared/layout/sidebar-section-registry';

it('registers the rooms tree in the sidebar', () => {
  expect(getSidebarSections()).toContainEqual(
    expect.objectContaining({ id: 'rooms', component: SidebarRooms }),
  );
});

it('titles the rooms pages', () => {
  expect(RoomsLayout.options.staticData?.title).toBe('rooms.title');
  expect(RoomsIndex.options.staticData?.title).toBe('rooms.title');
  expect(RoomsIndex.options.component).toBe(RoomsWelcomePage);
});
