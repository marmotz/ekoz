import { screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { SdkProvider } from '@/shared/sdk/provider';
import { RequireAuth } from '@/shared/sdk/require-auth';
import { renderWithProviders } from '../../../test/render';
import { createClientMock, createFakeSdk } from '../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

function protectedPage() {
  return (
    <SdkProvider>
      <RequireAuth>
        <p>secret</p>
      </RequireAuth>
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

  const { router } = renderWithProviders(protectedPage(), { route: '/private' });

  expect(await screen.findByTestId('auth-skeleton')).toBeInTheDocument();
  expect(screen.queryByText('secret')).not.toBeInTheDocument();
  expect(router.state.location.pathname).toBe('/private');
});

it('redirects an anonymous user to /login', async () => {
  createClientMock.mockReturnValue(createFakeSdk().sdk);

  const { router } = renderWithProviders(protectedPage(), { route: '/private' });

  await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  expect(screen.queryByText('secret')).not.toBeInTheDocument();
});

it('renders its children for an authenticated user', async () => {
  createClientMock.mockReturnValue(createFakeSdk({ identifier: null, sessionId: 's1' }).sdk);

  const { router } = renderWithProviders(protectedPage(), { route: '/private' });

  expect(await screen.findByText('secret')).toBeInTheDocument();
  expect(router.state.location.pathname).toBe('/private');
});
