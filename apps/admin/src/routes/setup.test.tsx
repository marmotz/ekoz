import { EkozError } from '@ekozhq/sdk';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Route as SetupRoute } from '@/routes/setup';
import { renderRoute } from '../../test/render';
import { createMockSdk } from '../../test/sdk-mock';

function mount(sdk: ReturnType<typeof createMockSdk>) {
  return renderRoute({
    route: SetupRoute,
    path: '/setup',
    initialPath: '/setup',
    sdk,
    extraPaths: ['/login', '/users'],
  });
}

describe('/setup', () => {
  it('shows the already-initialized screen when state is closed', async () => {
    const sdk = createMockSdk();
    vi.mocked(sdk.setup.state).mockResolvedValue({ state: 'closed' } as never);

    mount(sdk);

    await waitFor(() => expect(screen.getByText(/already initialized/i)).toBeInTheDocument());
  });

  it('shows the token field only when state is token-pinned', async () => {
    const sdk = createMockSdk();
    vi.mocked(sdk.setup.state).mockResolvedValue({ state: 'token-pinned' } as never);

    mount(sdk);

    await waitFor(() => expect(screen.getByPlaceholderText('Setup token')).toBeInTheDocument());
  });

  it('does not show the token field when state is email-pinned', async () => {
    const sdk = createMockSdk();
    vi.mocked(sdk.setup.state).mockResolvedValue({ state: 'email-pinned' } as never);

    mount(sdk);

    await waitFor(() => expect(screen.getByPlaceholderText('Email')).toBeInTheDocument());
    expect(screen.queryByPlaceholderText('Setup token')).not.toBeInTheDocument();
  });

  it('submits the owner payload and navigates to /users on success', async () => {
    const sdk = createMockSdk();
    vi.mocked(sdk.setup.state).mockResolvedValue({ state: 'email-pinned' } as never);
    vi.mocked(sdk.setup.createOwner).mockResolvedValue({} as never);

    const { router } = mount(sdk);

    await waitFor(() => expect(screen.getByPlaceholderText('Email')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('Email'), {
      target: { value: 'owner@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByPlaceholderText('Identifier'), { target: { value: 'owner' } });
    fireEvent.change(screen.getByPlaceholderText('Display name'), { target: { value: 'Owner' } });
    fireEvent.click(screen.getByRole('button', { name: /create owner account/i }));

    await waitFor(() =>
      expect(sdk.setup.createOwner).toHaveBeenCalledWith({
        email: 'owner@example.com',
        password: 'password123',
        name: 'owner',
        displayName: 'Owner',
      }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe('/users'));
  });

  it('redirects to /login on a setup.closed race', async () => {
    const sdk = createMockSdk();
    vi.mocked(sdk.setup.state).mockResolvedValue({ state: 'email-pinned' } as never);
    vi.mocked(sdk.setup.createOwner).mockRejectedValue(
      new EkozError({ status: 410, code: 'setup.closed' }),
    );

    const { router } = mount(sdk);

    await waitFor(() => expect(screen.getByPlaceholderText('Email')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('Email'), {
      target: { value: 'owner@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByPlaceholderText('Identifier'), { target: { value: 'owner' } });
    fireEvent.change(screen.getByPlaceholderText('Display name'), { target: { value: 'Owner' } });
    fireEvent.click(screen.getByRole('button', { name: /create owner account/i }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });
});
