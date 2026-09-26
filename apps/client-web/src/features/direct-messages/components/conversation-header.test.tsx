import { EkozError } from '@ekozhq/sdk';
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConversationHeader } from '@/features/direct-messages/components/conversation-header';
import { conversationItem, participant } from '../../../../test/conversation-fixtures';
import { renderSignedIn } from '../../../../test/render-signed-in';
import { createClientMock } from '../../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

beforeEach(() => {
  createClientMock.mockReset();
});

const dm = conversationItem({ id: 'c1', participants: [participant('u2', 'Bob')] });
const group = conversationItem({
  id: 'g1',
  type: 'group_dm',
  name: 'Trip',
  participants: [participant('u2', 'Bob')],
});

describe('ConversationHeader', () => {
  it('shows the other person and their identifier for a dm', async () => {
    renderSignedIn(<ConversationHeader room={dm} conversation={dm} />);

    expect(await screen.findByRole('heading', { name: 'Bob' })).toBeInTheDocument();
    expect(screen.getByText('bob/example.test')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete the conversation' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument();
  });

  it('shows the group name and a settings link for a group', async () => {
    renderSignedIn(<ConversationHeader room={group} conversation={group} />);

    expect(await screen.findByRole('heading', { name: 'Trip' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'href',
      '/dms/g1/settings',
    );
    expect(
      screen.queryByRole('button', { name: 'Delete the conversation' }),
    ).not.toBeInTheDocument();
  });

  it('names a conversation only known through GET /rooms/:id with a placeholder', async () => {
    renderSignedIn(<ConversationHeader room={dm} conversation={null} />);

    expect(await screen.findByRole('heading', { name: 'Direct message' })).toBeInTheDocument();
  });

  it('deletes a dm after a confirmation, refreshes the list and goes home', async () => {
    const { fake, user, router, queryClient } = renderSignedIn(
      <ConversationHeader room={dm} conversation={dm} />,
      { route: '/dms/c1' },
    );
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await user.click(await screen.findByRole('button', { name: 'Delete the conversation' }));
    expect(fake.stubs.rooms.leave).not.toHaveBeenCalled();
    await user.click(await screen.findByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(fake.stubs.rooms.leave).toHaveBeenCalledWith('c1'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['conversations', 'list'] });
  });

  it('does not delete when the confirmation is cancelled', async () => {
    const { fake, user } = renderSignedIn(<ConversationHeader room={dm} conversation={dm} />);

    await user.click(await screen.findByRole('button', { name: 'Delete the conversation' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(fake.stubs.rooms.leave).not.toHaveBeenCalled();
  });

  it('shows the failure of the delete inside the dialog and stays', async () => {
    const { user, router } = renderSignedIn(<ConversationHeader room={dm} conversation={dm} />, {
      route: '/dms/c1',
      configure: ({ stubs }) =>
        stubs.rooms.leave.mockRejectedValue(new EkozError({ code: 'room.not_found', status: 404 })),
    });

    await user.click(await screen.findByRole('button', { name: 'Delete the conversation' }));
    await user.click(await screen.findByRole('button', { name: 'Delete' }));

    expect(
      await screen.findByText('This conversation does not exist or is not accessible.'),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/dms/c1');
  });
});
