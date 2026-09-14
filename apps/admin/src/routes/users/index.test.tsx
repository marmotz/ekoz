import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Route as UsersListRoute } from '@/routes/users/index';
import { renderRoute } from '../../../test/render';
import { createMockSdk } from '../../../test/sdk-mock';

const baseUser = {
  id: 'u1',
  identifier: 'alice',
  email: 'alice@example.com',
  displayName: 'Alice',
  isOwner: false,
  emailVerified: true,
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  suspendedAt: null,
  suspendedReason: null,
};

function mount(sdk: ReturnType<typeof createMockSdk>) {
  return renderRoute({
    route: UsersListRoute,
    path: '/users/',
    initialPath: '/users/',
    sdk,
    extraPaths: ['/users/new', '/users/$userId'],
  });
}

describe('/users', () => {
  it('renders the list', async () => {
    const sdk = createMockSdk();
    vi.mocked(sdk.admin.users.list).mockResolvedValue({
      items: [baseUser],
      nextCursor: null,
    } as never);

    mount(sdk);

    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
  });

  it('re-queries with the search term', async () => {
    const sdk = createMockSdk();
    vi.mocked(sdk.admin.users.list).mockResolvedValue({ items: [], nextCursor: null } as never);

    mount(sdk);

    const searchInput = await screen.findByPlaceholderText(/search/i);
    await waitFor(() => expect(sdk.admin.users.list).toHaveBeenCalled());

    fireEvent.change(searchInput, { target: { value: 'alice' } });

    await waitFor(() =>
      expect(sdk.admin.users.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ q: 'alice' }),
      ),
    );
  });

  it('paginates with load more', async () => {
    const sdk = createMockSdk();
    vi.mocked(sdk.admin.users.list)
      .mockResolvedValueOnce({ items: [baseUser], nextCursor: 'cursor-2' } as never)
      .mockResolvedValueOnce({
        items: [{ ...baseUser, id: 'u2', displayName: 'Bob' }],
        nextCursor: null,
      } as never);

    mount(sdk);

    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /load more/i }));

    await waitFor(() => expect(screen.getByText('Bob')).toBeInTheDocument());
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });
});
