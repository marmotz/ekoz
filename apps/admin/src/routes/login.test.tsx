import { InvalidCredentialsError } from '@ekozhq/sdk';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Route as LoginRoute } from '@/routes/login';
import { renderRoute } from '../../test/render';
import { createMockSdk } from '../../test/sdk-mock';

function mount(sdk: ReturnType<typeof createMockSdk>) {
  return renderRoute({
    route: LoginRoute,
    path: '/login',
    initialPath: '/login',
    sdk,
    extraPaths: ['/users'],
  });
}

describe('/login', () => {
  it('logs in and navigates to /users on success', async () => {
    const sdk = createMockSdk();
    sdk.session.getState = () => undefined;
    vi.mocked(sdk.auth.login).mockResolvedValue({} as never);

    const { router } = mount(sdk);

    fireEvent.change(await screen.findByPlaceholderText('Identifier'), {
      target: { value: 'alice' },
    });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() =>
      expect(sdk.auth.login).toHaveBeenCalledWith({ identifier: 'alice', password: 'secret123' }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe('/users'));
  });

  it('shows an error on invalid credentials', async () => {
    const sdk = createMockSdk();
    sdk.session.getState = () => undefined;
    vi.mocked(sdk.auth.login).mockRejectedValue(
      new InvalidCredentialsError({ status: 401, code: 'auth.invalid_credentials' }),
    );

    mount(sdk);

    fireEvent.change(await screen.findByPlaceholderText('Identifier'), {
      target: { value: 'alice' },
    });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() =>
      expect(screen.getByText(/incorrect identifier or password/i)).toBeInTheDocument(),
    );
  });
});
