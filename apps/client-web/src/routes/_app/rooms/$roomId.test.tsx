import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, expect, it, vi } from 'vitest';

import { createI18n } from '@/app/i18n';
import { ThemeProvider } from '@/app/theme';
import { Route } from '@/routes/_app/rooms/$roomId';
import { SdkProvider } from '@/shared/sdk/provider';
import { createClientMock, createFakeSdk } from '../../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

beforeEach(() => {
  createClientMock.mockReset();
});

it('titles the page', () => {
  expect(Route.options.staticData?.title).toBe('chat.title');
});

it('composes RoomGate around RoomChat for the room in the URL', async () => {
  const fake = createFakeSdk({ identifier: 'jane/example.test', sessionId: 's1' });
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

  // The `_app` layout and the root route need the TanStack Start runtime, so the page route is
  // re-parented under a bare root: what is under test is the route's own composition.
  const rootRoute = createRootRoute();
  const pageRoute = Route.update({
    id: '/rooms/$roomId',
    path: '/rooms/$roomId',
    getParentRoute: () => rootRoute,
  } as never);
  const router = createRouter({
    routeTree: rootRoute.addChildren([pageRoute as never]),
    history: createMemoryHistory({ initialEntries: ['/rooms/room-42'] }),
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

  expect(await screen.findByText('hello from the room')).toBeInTheDocument();
  expect(fake.stubs.messages.list).toHaveBeenCalledWith('room-42');
  expect(screen.getByRole('textbox', { name: 'Message' })).toBeEnabled();
});
