import { EkozError } from '@ekozhq/sdk';
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { JoinRequestList } from '@/features/rooms/components/join-request-list';
import { type Configure, renderSignedIn } from '../../../../test/render-signed-in';
import { createClientMock } from '../../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

beforeEach(() => {
  createClientMock.mockReset();
});

function joinRequest(id: string, user: Partial<Record<string, string | null>> = {}) {
  return {
    id,
    roomId: 'r1',
    createdAt: '2026-03-14T10:00:00.000Z',
    user: {
      id: `u-${id}`,
      identifier: `${id}/example.test`,
      displayName: `User ${id}`,
      avatarUrl: null,
      ...user,
    },
  };
}

function renderList(configure?: Configure, capabilities = ['room.manage_members']) {
  return renderSignedIn(<JoinRequestList roomId="r1" />, {
    configure: (fake) => {
      fake.stubs.rooms.myPermissions.mockResolvedValue({ capabilities });
      configure?.(fake);
    },
  });
}

const withRequests =
  (...items: unknown[]): Configure =>
  ({ stubs }) =>
    stubs.rooms.listJoinRequests.mockResolvedValue({ items, nextCursor: null } as never);

describe('JoinRequestList', () => {
  it('guards the page without room.manage_members', async () => {
    const { fake } = renderList(undefined, ['room.read']);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You are not allowed to review the join requests of this room.',
    );
    expect(fake.stubs.rooms.listJoinRequests).not.toHaveBeenCalled();
  });

  it('shows an empty state', async () => {
    renderList();

    expect(await screen.findByText('No pending request.')).toBeInTheDocument();
  });

  it('lists the requester and the date of each request', async () => {
    renderList(withRequests(joinRequest('q1')));

    const row = (await screen.findByText('User q1')).closest('li') as HTMLElement;
    expect(within(row).getByText(/q1\/example\.test/)).toBeInTheDocument();
    expect(within(row).getByText(/Requested on Mar 14, 2026/)).toBeInTheDocument();
  });

  it('labels a deleted account', async () => {
    renderList(withRequests(joinRequest('q1', { identifier: null, displayName: null })));

    expect(await screen.findByText('Deleted account')).toBeInTheDocument();
  });

  it('approves a request and refreshes the list', async () => {
    const { fake, user } = renderList(withRequests(joinRequest('q1')));

    await user.click(await screen.findByRole('button', { name: 'Approve' }));

    expect(fake.stubs.rooms.approveJoinRequest).toHaveBeenCalledWith('r1', 'q1');
    await waitFor(() => expect(fake.stubs.rooms.listJoinRequests).toHaveBeenCalledTimes(2));
  });

  it('rejects a request and refreshes the list', async () => {
    const { fake, user } = renderList(withRequests(joinRequest('q1')));

    await user.click(await screen.findByRole('button', { name: 'Reject' }));

    expect(fake.stubs.rooms.rejectJoinRequest).toHaveBeenCalledWith('r1', 'q1');
    await waitFor(() => expect(fake.stubs.rooms.listJoinRequests).toHaveBeenCalledTimes(2));
  });

  it('refreshes the list and explains a request resolved elsewhere', async () => {
    const { fake, user } = renderList((fake) => {
      withRequests(joinRequest('q1'))(fake);
      fake.stubs.rooms.approveJoinRequest.mockRejectedValue(
        new EkozError({ code: 'room.join_request_already_resolved', status: 409 }),
      );
    });

    await user.click(await screen.findByRole('button', { name: 'Approve' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This join request has already been handled.',
    );
    await waitFor(() => expect(fake.stubs.rooms.listJoinRequests).toHaveBeenCalledTimes(2));
  });

  it('loads the next page on demand', async () => {
    const { fake, user } = renderList(({ stubs }) =>
      stubs.rooms.listJoinRequests
        .mockResolvedValueOnce({ items: [joinRequest('q1')], nextCursor: 'c2' } as never)
        .mockResolvedValueOnce({ items: [joinRequest('q2')], nextCursor: null } as never),
    );

    await user.click(await screen.findByRole('button', { name: 'Load more' }));

    expect(await screen.findByText('User q2')).toBeInTheDocument();
    expect(screen.getByText('User q1')).toBeInTheDocument();
    expect(fake.stubs.rooms.listJoinRequests).toHaveBeenLastCalledWith('r1', { cursor: 'c2' });
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('offers a retry when the list cannot be loaded', async () => {
    const { fake, user } = renderList(({ stubs }) =>
      stubs.rooms.listJoinRequests.mockRejectedValueOnce(new Error('boom')),
    );

    await user.click(await screen.findByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('No pending request.')).toBeInTheDocument();
    expect(fake.stubs.rooms.listJoinRequests).toHaveBeenCalledTimes(2);
  });

  it('links back to the room', async () => {
    renderList();

    expect(await screen.findByRole('link', { name: 'Back to the room' })).toHaveAttribute(
      'href',
      '/rooms/r1',
    );
  });
});
