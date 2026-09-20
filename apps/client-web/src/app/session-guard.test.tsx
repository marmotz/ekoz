import { AuthenticationError } from '@ekozhq/sdk';
import { QueryClient } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { SessionGuard } from '@/app/session-guard';
import { emitUnhandledAuthenticationError } from '@/app/session-signal';
import { SdkProvider } from '@/shared/sdk/provider';
import { renderWithProviders } from '../../test/render';
import { createClientMock, createFakeSdk } from '../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

function setup() {
  const fake = createFakeSdk({ identifier: 'alice@ekoz.test', sessionId: 's1' });
  createClientMock.mockReturnValue(fake.sdk);
  const queryClient = new QueryClient();
  queryClient.setQueryData(['me'], { name: 'alice' });
  const rendered = renderWithProviders(
    <SdkProvider>
      <SessionGuard />
      <p>page</p>
    </SdkProvider>,
    { route: '/private', queryClient },
  );
  return { ...rendered, fake, queryClient };
}

beforeEach(() => {
  createClientMock.mockReset();
});

it('clears the query cache and goes to /login on session:invalid', async () => {
  const { fake, queryClient, router } = setup();
  await screen.findByText('page');
  await waitFor(() => expect(fake.listenerCount('session:invalid')).toBe(1));

  fake.emit('session:invalid', { reason: 'refresh_failed' });

  await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  expect(queryClient.getQueryData(['me'])).toBeUndefined();
});

it('signs out on an unhandled AuthenticationError', async () => {
  const { fake, queryClient, router } = setup();
  await screen.findByText('page');
  await waitFor(() => expect(fake.listenerCount('session:invalid')).toBe(1));

  emitUnhandledAuthenticationError(
    new AuthenticationError({ code: 'auth.unauthenticated', status: 401 }),
  );

  await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  expect(fake.stubs.session.clear).toHaveBeenCalledTimes(1);
  expect(queryClient.getQueryData(['me'])).toBeUndefined();
});

it('stops listening on unmount', async () => {
  const { fake, unmount } = setup();
  await waitFor(() => expect(fake.listenerCount('session:invalid')).toBe(1));

  unmount();

  expect(fake.listenerCount('session:invalid')).toBe(0);
});
