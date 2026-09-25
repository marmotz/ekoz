import { act, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

import { Route } from '@/routes/_app';
import { SdkProvider } from '@/shared/sdk/provider';
import { renderWithProviders } from '../../test/render';
import { createClientMock, createFakeSdk } from '../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

const AppLayout = Route.options.component;
if (!AppLayout) throw new Error('The _app layout has no component');

beforeEach(() => {
  createClientMock.mockReset();
});

it('redirects an anonymous visitor to /login', async () => {
  createClientMock.mockReturnValue(createFakeSdk().sdk);

  const { router } = renderWithProviders(<SdkProvider>{createElement(AppLayout)}</SdkProvider>, {
    route: '/',
  });

  await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
});

it('keeps an authenticated user on the page', async () => {
  createClientMock.mockReturnValue(createFakeSdk({ identifier: null, sessionId: 's1' }).sdk);

  const { router } = renderWithProviders(<SdkProvider>{createElement(AppLayout)}</SdkProvider>, {
    route: '/',
  });

  expect(await screen.findByRole('button', { name: 'Account menu' })).toBeInTheDocument();
  expect(router.state.location.pathname).toBe('/');
});

it('keeps the unread mention counters live for a signed-in user', async () => {
  const fake = createFakeSdk({ identifier: null, sessionId: 's1' });
  createClientMock.mockReturnValue(fake.sdk);
  const { queryClient } = renderWithProviders(
    <SdkProvider>{createElement(AppLayout)}</SdkProvider>,
    { route: '/' },
  );
  await screen.findByRole('button', { name: 'Account menu' });
  await waitFor(() => expect(fake.stubs.me.get).toHaveBeenCalled());
  await waitFor(() => expect(queryClient.getQueryData(['me'])).toBeDefined());
  queryClient.setQueryData(['mentions', 'unread'], { items: [] });

  act(() =>
    fake.streamControl.emit('room_event', {
      roomId: 'r9',
      feedSeq: '1',
      event: {
        type: 'message_created',
        roomId: 'r9',
        seq: '1',
        senderId: 'someone',
        createdAt: '2026-01-01T00:00:00.000Z',
        content: {
          messageId: 'm1',
          body: '@all',
          replyToId: null,
          mentions: [{ type: 'all', target: null, token: '@all' }],
        },
      },
    }),
  );

  // No counter is on screen here, so the query is only marked stale.
  await waitFor(() =>
    expect(queryClient.getQueryState(['mentions', 'unread'])?.isInvalidated).toBe(true),
  );
});
