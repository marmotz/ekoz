import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Route as NewUserRoute } from '@/routes/users/new';
import { renderRoute } from '../../../test/render';
import { createMockSdk } from '../../../test/sdk-mock';

function mount(sdk: ReturnType<typeof createMockSdk>) {
  return renderRoute({
    route: NewUserRoute,
    path: '/users/new',
    initialPath: '/users/new',
    sdk,
    extraPaths: ['/users/$userId'],
  });
}

describe('/users/new', () => {
  it('submits the create-user payload and navigates to the new detail page', async () => {
    const sdk = createMockSdk();
    vi.mocked(sdk.admin.users.create).mockResolvedValue({ id: 'u9' } as never);

    const { router } = mount(sdk);

    fireEvent.change(await screen.findByPlaceholderText('Email'), {
      target: { value: 'bob@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Identifier'), { target: { value: 'bob' } });
    fireEvent.change(screen.getByPlaceholderText('Display name'), { target: { value: 'Bob' } });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /create user/i }));

    await waitFor(() =>
      expect(sdk.admin.users.create).toHaveBeenCalledWith({
        email: 'bob@example.com',
        name: 'bob',
        displayName: 'Bob',
        password: 'password123',
      }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe('/users/u9'));
  });
});
