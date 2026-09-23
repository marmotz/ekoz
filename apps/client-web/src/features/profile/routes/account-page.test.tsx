import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';

import { AccountPage } from '@/features/profile/routes/account-page';
import { SdkProvider } from '@/shared/sdk/provider';
import { RequireAuth } from '@/shared/sdk/require-auth';
import { renderWithProviders } from '../../../../test/render';
import { createClientMock, createFakeSdk, type FakeSession } from '../../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));

const signedIn: FakeSession = { identifier: 'jane/example.test', sessionId: 's1' };

/** The page inside the guard the `_app` layout puts around every route. */
function renderPage(fake: ReturnType<typeof createFakeSdk>) {
  createClientMock.mockReturnValue(fake.sdk);
  return renderWithProviders(
    <SdkProvider>
      <RequireAuth>
        <AccountPage />
      </RequireAuth>
    </SdkProvider>,
    { route: '/account' },
  );
}

beforeEach(() => {
  createClientMock.mockReset();
});

it('redirects an anonymous visitor to /login without fetching anything', async () => {
  const fake = createFakeSdk();

  const { router } = renderPage(fake);

  await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  expect(fake.stubs.me.get).not.toHaveBeenCalled();
});

it('shows a skeleton while the account is loading', async () => {
  const fake = createFakeSdk(signedIn);
  fake.stubs.me.get.mockReturnValue(new Promise(() => {}));

  renderPage(fake);

  expect(await screen.findByTestId('account-skeleton')).toBeInTheDocument();
});

it('shows an error when the account cannot be loaded', async () => {
  const fake = createFakeSdk(signedIn);
  fake.stubs.me.get.mockRejectedValue(new Error('offline'));

  renderPage(fake);

  expect(await screen.findByText('Something went wrong. Try again.')).toBeInTheDocument();
});

it('composes the sections in order', async () => {
  renderPage(createFakeSdk(signedIn));

  await screen.findByText('Danger zone');

  const titles = [
    'Profile',
    'Avatar',
    'Username',
    'Email address',
    'Password',
    'Sessions',
    'Danger zone',
  ];
  const shown = screen
    .getAllByRole('heading')
    .map((heading) => heading.textContent)
    .filter((text) => titles.includes(text ?? ''));
  expect(shown).toEqual(titles);
});

it('shows the sections in French', async () => {
  createClientMock.mockReturnValue(createFakeSdk(signedIn).sdk);
  renderWithProviders(
    <SdkProvider>
      <AccountPage />
    </SdkProvider>,
    { language: 'fr' },
  );

  expect(await screen.findByText('Zone de danger')).toBeInTheDocument();
  expect(screen.getByText('Changer le mot de passe')).toBeInTheDocument();
});

it('lands on /login and empties the query cache once the account is deleted', async () => {
  const user = userEvent.setup();
  const fake = createFakeSdk(signedIn);
  // Like the real SDK: a deleted account clears the session.
  fake.stubs.me.deleteAccount.mockImplementation(async () => {
    await fake.stubs.session.clear();
  });
  const { router, queryClient } = renderPage(fake);

  await user.click(await screen.findByRole('button', { name: 'Delete my account' }));
  const dialog = within(await screen.findByRole('dialog'));
  await user.type(dialog.getByLabelText('Current password'), 'secret');
  await user.click(dialog.getByRole('button', { name: 'Delete the account' }));

  await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  expect(queryClient.getQueryData(['me'])).toBeUndefined();
});
