import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, expect, it, vi } from 'vitest';

import { createI18n } from '@/app/i18n';
import { ThemeProvider } from '@/app/theme';
import {
  MEMBERS_PANEL_STORAGE_KEY,
  reloadMembersPanelPrefs,
} from '@/features/members/hooks/use-members-panel-prefs';
import { Route } from '@/routes/_app/rooms/$roomId';
import { Route as RequestsRoute } from '@/routes/_app/rooms/$roomId/requests';
import { SdkProvider } from '@/shared/sdk/provider';
import { roomItem } from '../../../../test/room-fixtures';
import { createClientMock, createFakeSdk } from '../../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

beforeEach(() => {
  createClientMock.mockReset();
  window.localStorage.clear();
  reloadMembersPanelPrefs();
  useDesktopViewport();
});

/** From `lg` the members panel is an inline column next to the content. */
function useDesktopViewport() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: query.includes('min-width: 1024px'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

/**
 * The `_app` layout and the root route need the TanStack Start runtime, so the page route
 * and its child are re-parented under a bare root: what is under test is the route's own
 * composition.
 */
function renderRoom(path: string, capabilities: string[], roomType = 'channel') {
  const fake = createFakeSdk({ identifier: 'jane/example.test', sessionId: 's1' });
  fake.stubs.rooms.list.mockResolvedValue({
    items: [roomItem({ id: 'room-42', name: 'General', type: roomType as never })],
  });
  fake.stubs.rooms.myPermissions.mockResolvedValue({ capabilities });
  fake.stubs.messages.list.mockResolvedValue({
    items: [
      {
        id: 'm1',
        roomId: 'room-42',
        seq: '1',
        authorId: 'u1',
        body: 'hello from the room',
        replyToId: null,
        mentions: [],
        editedAt: null,
        redactedAt: null,
        hiddenAt: null,
        createdAt: '2026-01-01T10:00:00.000Z',
      },
    ],
    lastSeq: '1',
    hasMore: false,
  } as never);
  createClientMock.mockReturnValue(fake.sdk);

  const rootRoute = createRootRoute();
  const pageRoute = Route.update({
    id: '/rooms/$roomId',
    path: '/rooms/$roomId',
    getParentRoute: () => rootRoute,
  } as never);
  const requestsRoute = RequestsRoute.update({
    id: '/requests',
    path: '/requests',
    getParentRoute: () => pageRoute,
  } as never);
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      (pageRoute as unknown as typeof Route).addChildren([requestsRoute as never]) as never,
    ]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <I18nextProvider i18n={createI18n('en')}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <SdkProvider>
            <RouterProvider router={router} />
          </SdkProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </I18nextProvider>,
  );

  return fake;
}

it('titles the page', () => {
  expect(Route.options.staticData?.title).toBe('chat.title');
  expect(RequestsRoute.options.staticData?.title).toBe('rooms.requests.title');
});

it('composes RoomGate, RoomHeader and RoomChat for the room in the URL', async () => {
  const fake = renderRoom('/rooms/room-42', ['room.read', 'room.post']);

  expect(await screen.findByText('hello from the room')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'General' })).toBeInTheDocument();
  expect(fake.stubs.messages.list).toHaveBeenCalledWith('room-42');
  expect(screen.getByRole('textbox', { name: 'Message' })).toBeEnabled();
});

it('renders the join requests instead of the chat under the same header', async () => {
  const fake = renderRoom('/rooms/room-42/requests', ['room.read', 'room.manage_members']);

  expect(await screen.findByRole('heading', { name: 'Join requests' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'General' })).toBeInTheDocument();
  expect(await screen.findByText('No pending request.')).toBeInTheDocument();
  expect(fake.stubs.messages.list).not.toHaveBeenCalled();
});

it('refreshes the members list when a membership event of the room arrives', async () => {
  const fake = renderRoom('/rooms/room-42', ['room.read', 'room.post']);
  await screen.findByText('hello from the room');
  await waitFor(() => expect(fake.stubs.rooms.members).toHaveBeenCalledTimes(1));

  act(() =>
    fake.streamControl.emit('room_event', {
      roomId: 'room-42',
      feedSeq: '2',
      event: {
        type: 'member_left',
        roomId: 'room-42',
        seq: '2',
        senderId: 'u9',
        createdAt: '2026-01-02T00:00:00.000Z',
        content: { userId: 'u9' },
      },
    }),
  );

  await waitFor(() => expect(fake.stubs.rooms.members).toHaveBeenCalledTimes(2));
});

const roomMember = (id: string, displayName: string) => ({
  role: 'member',
  joinedAt: '2026-01-01T00:00:00.000Z',
  user: { id, identifier: `${displayName.toLowerCase()}/h.io`, displayName, avatarUrl: null },
});

function openPanelPreference() {
  window.localStorage.setItem(
    MEMBERS_PANEL_STORAGE_KEY,
    JSON.stringify({ open: true, view: 'role' }),
  );
  reloadMembersPanelPrefs();
}

it('puts the members toggle in the room header and opens the panel beside the chat', async () => {
  const fake = renderRoom('/rooms/room-42', ['room.read', 'room.post']);
  fake.stubs.rooms.members.mockResolvedValue({
    items: [roomMember('u1', 'Alice'), roomMember('u2', 'Bob')],
    nextCursor: null,
  } as never);
  const header = (await screen.findByRole('heading', { name: 'General' })).closest('header');
  const toggle = await within(header as HTMLElement).findByRole('button', { name: /Members/ });
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument();

  fireEvent.click(toggle);

  const panel = await screen.findByRole('complementary', { name: 'Members' });
  expect(await within(panel).findByText('Bob')).toBeInTheDocument();
  expect(screen.getByText('hello from the room')).toBeInTheDocument();
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
});

it('keeps the members panel next to a child page', async () => {
  openPanelPreference();
  const fake = renderRoom('/rooms/room-42/requests', ['room.read', 'room.manage_members']);
  fake.stubs.rooms.members.mockResolvedValue({
    items: [roomMember('u1', 'Alice')],
    nextCursor: null,
  } as never);

  expect(await screen.findByRole('heading', { name: 'Join requests' })).toBeInTheDocument();
  const panel = await screen.findByRole('complementary', { name: 'Members' });
  expect(await within(panel).findByText('Alice')).toBeInTheDocument();
});

it('shows the members panel for a space too', async () => {
  openPanelPreference();
  renderRoom('/rooms/room-42', ['room.read'], 'space');

  expect(await screen.findByRole('complementary', { name: 'Members' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Members/ })).toBeInTheDocument();
});

it('offers no members panel in a direct message room', async () => {
  openPanelPreference();
  const fake = renderRoom('/rooms/room-42', ['room.read'], 'dm');

  await screen.findByRole('heading', { name: 'General' });
  await waitFor(() => expect(fake.stubs.messages.list).toHaveBeenCalled());
  expect(screen.queryByRole('button', { name: /Members/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
});
