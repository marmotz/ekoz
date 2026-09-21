import { screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { GuestOnly } from '@/features/auth/components/guest-only';
import { SdkProvider } from '@/shared/sdk/provider';
import { renderWithProviders } from '../../../../test/render';
import { createClientMock, createFakeSdk } from '../../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

function guestPage() {
  return (
    <SdkProvider>
      <GuestOnly>
        <p>sign in form</p>
      </GuestOnly>
    </SdkProvider>
  );
}

beforeEach(() => {
  createClientMock.mockReset();
});

it('shows a skeleton while the session is unknown', async () => {
  const fake = createFakeSdk();
  fake.stubs.session.resume.mockReturnValue(new Promise(() => {}));
  createClientMock.mockReturnValue(fake.sdk);

  const { router } = renderWithProviders(guestPage(), { route: '/login' });

  expect(await screen.findByTestId('guest-skeleton')).toBeInTheDocument();
  expect(screen.queryByText('sign in form')).not.toBeInTheDocument();
  expect(router.state.location.pathname).toBe('/login');
});

it('renders its children for an anonymous visitor', async () => {
  createClientMock.mockReturnValue(createFakeSdk().sdk);

  const { router } = renderWithProviders(guestPage(), { route: '/login' });

  expect(await screen.findByText('sign in form')).toBeInTheDocument();
  expect(router.state.location.pathname).toBe('/login');
});

it('sends an authenticated user to / and replaces the history entry', async () => {
  createClientMock.mockReturnValue(createFakeSdk({ identifier: null, sessionId: 's1' }).sdk);

  const { router } = renderWithProviders(guestPage(), { route: '/login' });

  await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  expect(router.history.length).toBe(1);
  expect(screen.queryByText('sign in form')).not.toBeInTheDocument();
});

it('redirects once the session becomes authenticated (sign-in completed)', async () => {
  const fake = createFakeSdk();
  createClientMock.mockReturnValue(fake.sdk);

  const { router } = renderWithProviders(guestPage(), { route: '/login' });
  await screen.findByText('sign in form');

  fake.setSession({ identifier: null, sessionId: 's1' });
  fake.emit('session:authenticated', { identifier: null, sessionId: 's1' });

  await waitFor(() => expect(router.state.location.pathname).toBe('/'));
});
