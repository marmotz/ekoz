import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Route as InvitationsRoute } from '@/routes/invitations';
import { renderRoute } from '../../test/render';
import { createMockSdk } from '../../test/sdk-mock';

const invitation = {
  id: 'i1',
  email: 'guest@example.com',
  createdByUserId: 'u1',
  createdAt: '2026-01-01T00:00:00.000Z',
  expiresAt: '2026-02-01T00:00:00.000Z',
  consumedAt: null,
  consumedByUserId: null,
  status: 'pending',
};

function mount(sdk: ReturnType<typeof createMockSdk>) {
  return renderRoute({
    route: InvitationsRoute,
    path: '/invitations',
    initialPath: '/invitations',
    sdk,
  });
}

describe('/invitations', () => {
  it('renders the list', async () => {
    const sdk = createMockSdk();
    vi.mocked(sdk.invitations.list).mockResolvedValue([invitation] as never);

    mount(sdk);

    await waitFor(() => expect(screen.getByText('guest@example.com')).toBeInTheDocument());
  });

  it('creates an invitation and shows the token once', async () => {
    const sdk = createMockSdk();
    vi.mocked(sdk.invitations.list).mockResolvedValue([] as never);
    vi.mocked(sdk.invitations.create).mockResolvedValue({
      id: 'i2',
      token: 'secret-token',
      url: 'https://ekoz.example/invite/secret-token',
    } as never);

    mount(sdk);

    const newInvitationButton = await screen.findByRole('button', { name: /new invitation/i });
    await waitFor(() => expect(sdk.invitations.list).toHaveBeenCalled());
    fireEvent.click(newInvitationButton);
    fireEvent.click(await screen.findByRole('button', { name: /create invitation/i }));

    await waitFor(() => expect(sdk.invitations.create).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByDisplayValue('secret-token')).toBeInTheDocument());
  });

  it('revokes an invitation after confirmation', async () => {
    const sdk = createMockSdk();
    vi.mocked(sdk.invitations.list).mockResolvedValue([invitation] as never);
    vi.mocked(sdk.invitations.revoke).mockResolvedValue(undefined as never);

    mount(sdk);

    await waitFor(() => expect(screen.getByText('guest@example.com')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /revoke/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    await waitFor(() => expect(sdk.invitations.revoke).toHaveBeenCalledWith('i1'));
  });
});
