import { expect, it } from 'vitest';

import { CreateRoomForm } from '@/features/rooms/components/create-room-form';
import { DirectoryList } from '@/features/rooms/components/directory-list';
import { InvitationList } from '@/features/rooms/components/invitation-list';
import { SidebarRooms } from '@/features/rooms/components/sidebar-rooms';
import { RoomsWelcomePage } from '@/features/rooms/routes/rooms-welcome-page';
import { Route as RoomsLayout } from '@/routes/_app/rooms';
import { Route as RoomsDirectory } from '@/routes/_app/rooms/directory';
import { Route as RoomsIndex } from '@/routes/_app/rooms/index';
import { Route as RoomsInvitations } from '@/routes/_app/rooms/invitations';
import { Route as RoomsNew } from '@/routes/_app/rooms/new';
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

it('serves the creation form and the directory', () => {
  expect(RoomsNew.options.staticData?.title).toBe('rooms.create.title');
  expect(RoomsNew.options.component).toBe(CreateRoomForm);
  expect(RoomsDirectory.options.staticData?.title).toBe('rooms.directory.title');
  expect(RoomsDirectory.options.component).toBe(DirectoryList);
});

it('serves the invitations page', () => {
  expect(RoomsInvitations.options.staticData?.title).toBe('rooms.invitations.title');
  expect(RoomsInvitations.options.component).toBe(InvitationList);
});
