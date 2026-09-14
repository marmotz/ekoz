import { LastOwnerError } from '@ekozhq/sdk';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Route as UserDetailRoute } from '@/routes/users/$userId';
import { renderRoute } from '../../../test/render';
import { createMockSdk } from '../../../test/sdk-mock';

const detail = {
  id: 'u1',
  identifier: 'alice',
  email: 'alice@example.com',
  displayName: 'Alice',
  isOwner: true,
  emailVerified: true,
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  suspendedAt: null,
  suspendedReason: null,
  emailVerifiedAt: '2026-01-01T00:00:00.000Z',
  activeSessionCount: 2,
};

function mount(sdk: ReturnType<typeof createMockSdk>) {
  return renderRoute({
    route: UserDetailRoute,
    path: '/users/$userId',
    initialPath: '/users/u1',
    sdk,
  });
}

describe('/users/$userId', () => {
  it('renders the account detail', async () => {
    const sdk = createMockSdk();
    vi.mocked(sdk.admin.users.get).mockResolvedValue(detail as never);
    vi.mocked(sdk.admin.users.list).mockResolvedValue({
      items: [detail, { ...detail, id: 'u2' }],
    } as never);

    mount(sdk);

    await waitFor(() => expect(screen.getByText('alice')).toBeInTheDocument());
    expect(sdk.admin.users.get).toHaveBeenCalledWith('u1');
  });

  it('hides revoke owner when this is the last owner', async () => {
    const sdk = createMockSdk();
    vi.mocked(sdk.admin.users.get).mockResolvedValue(detail as never);
    vi.mocked(sdk.admin.users.list).mockResolvedValue({ items: [detail] } as never);

    mount(sdk);

    await waitFor(() => expect(sdk.admin.users.list).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /revoke owner/i })).not.toBeInTheDocument(),
    );
  });

  it('shows an error toast when revoking the last owner slips through as a 409', async () => {
    const sdk = createMockSdk();
    vi.mocked(sdk.admin.users.get).mockResolvedValue(detail as never);
    vi.mocked(sdk.admin.users.list).mockResolvedValue({
      items: [detail, { ...detail, id: 'u2' }],
    } as never);
    vi.mocked(sdk.admin.owners.remove).mockRejectedValue(
      new LastOwnerError({ status: 409, code: 'identity.last_owner' }),
    );

    mount(sdk);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /revoke owner/i })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: /revoke owner/i }));

    await waitFor(() => expect(sdk.admin.owners.remove).toHaveBeenCalledWith('u1'));
    await waitFor(() =>
      expect(screen.getByText(/cannot revoke the last remaining owner/i)).toBeInTheDocument(),
    );
  });

  it('calls suspend with the given reason', async () => {
    const sdk = createMockSdk();
    vi.mocked(sdk.admin.users.get).mockResolvedValue({ ...detail, isOwner: false } as never);
    vi.mocked(sdk.admin.users.suspend).mockResolvedValue(undefined as never);

    mount(sdk);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^suspend$/i })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: /^suspend$/i }));

    fireEvent.change(screen.getByPlaceholderText(/reason/i), { target: { value: 'abuse' } });
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    await waitFor(() =>
      expect(sdk.admin.users.suspend).toHaveBeenCalledWith('u1', { reason: 'abuse' }),
    );
  });

  it('triggers a password reset', async () => {
    const sdk = createMockSdk();
    vi.mocked(sdk.admin.users.get).mockResolvedValue({ ...detail, isOwner: false } as never);
    vi.mocked(sdk.admin.users.triggerPasswordReset).mockResolvedValue({ accepted: true } as never);

    mount(sdk);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /send password reset/i })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: /send password reset/i }));

    await waitFor(() => expect(sdk.admin.users.triggerPasswordReset).toHaveBeenCalledWith('u1'));
  });
});
