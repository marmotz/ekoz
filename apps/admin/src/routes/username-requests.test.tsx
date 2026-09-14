import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Route as UsernameRequestsRoute } from '@/routes/username-requests';
import { renderRoute } from '../../test/render';
import { createMockSdk } from '../../test/sdk-mock';

const request = {
  id: 'r1',
  userId: 'u1',
  requestedName: 'newname',
  status: 'pending',
  createdAt: '2026-01-01T00:00:00.000Z',
  resolvedAt: null,
  resolvedByUserId: null,
};

function mount(sdk: ReturnType<typeof createMockSdk>) {
  return renderRoute({
    route: UsernameRequestsRoute,
    path: '/username-requests',
    initialPath: '/username-requests',
    sdk,
  });
}

describe('/username-requests', () => {
  it('renders pending requests by default', async () => {
    const sdk = createMockSdk();
    vi.mocked(sdk.admin.usernameRequests.list).mockResolvedValue([request] as never);

    mount(sdk);

    await waitFor(() => expect(screen.getByText('newname')).toBeInTheDocument());
    expect(sdk.admin.usernameRequests.list).toHaveBeenCalledWith('pending');
  });

  it('approves a request', async () => {
    const sdk = createMockSdk();
    vi.mocked(sdk.admin.usernameRequests.list).mockResolvedValue([request] as never);
    vi.mocked(sdk.admin.usernameRequests.approve).mockResolvedValue({
      identifier: 'newname',
    } as never);

    mount(sdk);

    await waitFor(() => expect(screen.getByText('newname')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /approve/i }));

    await waitFor(() => expect(sdk.admin.usernameRequests.approve).toHaveBeenCalledWith('r1'));
  });

  it('rejects a request', async () => {
    const sdk = createMockSdk();
    vi.mocked(sdk.admin.usernameRequests.list).mockResolvedValue([request] as never);
    vi.mocked(sdk.admin.usernameRequests.reject).mockResolvedValue(undefined as never);

    mount(sdk);

    await waitFor(() => expect(screen.getByText('newname')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /reject/i }));

    await waitFor(() => expect(sdk.admin.usernameRequests.reject).toHaveBeenCalledWith('r1'));
  });

  it('re-queries when the status filter changes', async () => {
    const sdk = createMockSdk();
    vi.mocked(sdk.admin.usernameRequests.list).mockResolvedValue([] as never);

    mount(sdk);

    const select = await screen.findByRole('combobox');
    await waitFor(() => expect(sdk.admin.usernameRequests.list).toHaveBeenCalledWith('pending'));

    fireEvent.change(select, { target: { value: 'approved' } });

    await waitFor(() => expect(sdk.admin.usernameRequests.list).toHaveBeenCalledWith('approved'));
  });
});
