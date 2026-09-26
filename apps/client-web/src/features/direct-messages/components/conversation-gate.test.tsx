import { EkozError } from '@ekozhq/sdk';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConversationGate } from '@/features/direct-messages/components/conversation-gate';
import { conversationItem, participant } from '../../../../test/conversation-fixtures';
import { type Configure, renderSignedIn } from '../../../../test/render-signed-in';
import { createClientMock } from '../../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

beforeEach(() => {
  createClientMock.mockReset();
});

function renderGate(configure?: Configure) {
  return renderSignedIn(
    <ConversationGate roomId="c1">
      {({ room, conversation, capabilities }) => (
        <p data-testid="content">{`${room.id}|${room.type}|${conversation ? 'listed' : 'fallback'}|${capabilities.join(',')}`}</p>
      )}
    </ConversationGate>,
    { configure },
  );
}

const status = (code: string, httpStatus: number) => new EkozError({ code, status: httpStatus });

describe('ConversationGate', () => {
  it('shows a loading state while the conversations load', async () => {
    renderGate(({ stubs }) => stubs.conversations.list.mockReturnValue(new Promise(() => {})));

    expect(
      await screen.findByRole('status', { name: 'Loading the conversation' }),
    ).toBeInTheDocument();
  });

  it('renders a listed conversation without fetching the room again', async () => {
    const { fake } = renderGate(({ stubs }) => {
      stubs.conversations.list.mockResolvedValue({
        items: [conversationItem({ id: 'c1', participants: [participant('u2', 'Bob')] })],
      });
      stubs.rooms.myPermissions.mockResolvedValue({ capabilities: ['room.read', 'room.post'] });
    });

    expect(await screen.findByTestId('content')).toHaveTextContent(
      'c1|dm|listed|room.read,room.post',
    );
    expect(fake.stubs.rooms.get).not.toHaveBeenCalled();
    expect(fake.stubs.rooms.myPermissions).toHaveBeenCalledWith('c1');
  });

  it('falls back to GET /rooms/:id for a conversation missing from the list', async () => {
    const { fake } = renderGate(({ stubs }) => {
      stubs.rooms.get.mockResolvedValue({ id: 'c1', type: 'group_dm', name: null } as {
        id: string;
      });
      stubs.rooms.myPermissions.mockResolvedValue({ capabilities: ['room.read'] });
    });

    expect(await screen.findByTestId('content')).toHaveTextContent(
      'c1|group_dm|fallback|room.read',
    );
    expect(fake.stubs.rooms.get).toHaveBeenCalledWith('c1');
  });

  it('keeps the content readable when the capabilities cannot be loaded', async () => {
    renderGate(({ stubs }) => {
      stubs.conversations.list.mockResolvedValue({ items: [conversationItem({ id: 'c1' })] });
      stubs.rooms.myPermissions.mockRejectedValue(status('room.permission_denied', 403));
    });

    expect(await screen.findByTestId('content')).toHaveTextContent('c1|dm|listed|');
  });

  it.each([
    ['403', status('room.permission_denied', 403)],
    ['404', status('room.not_found', 404)],
  ])('shows "not available" when the room answers %s', async (_label, error) => {
    renderGate(({ stubs }) => stubs.rooms.get.mockRejectedValue(error));

    expect(await screen.findByText('Conversation unavailable')).toBeInTheDocument();
    expect(screen.queryByTestId('content')).not.toBeInTheDocument();
  });

  it('shows "not available" for a room that is not a conversation', async () => {
    renderGate(({ stubs }) =>
      stubs.rooms.get.mockResolvedValue({ id: 'c1', type: 'channel' } as { id: string }),
    );

    expect(await screen.findByText('Conversation unavailable')).toBeInTheDocument();
  });

  it('shows an error with a retry when the list fails', async () => {
    const { fake, user } = renderGate(({ stubs }) =>
      stubs.conversations.list.mockRejectedValueOnce(new Error('boom')),
    );

    expect(await screen.findByText('The conversation could not be loaded.')).toBeInTheDocument();
    fake.stubs.conversations.list.mockResolvedValue({
      items: [conversationItem({ id: 'c1' })],
    });
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByTestId('content')).toBeInTheDocument();
  });

  it('shows an error with a retry when the room fails with a server error', async () => {
    renderGate(({ stubs }) => stubs.rooms.get.mockRejectedValue(status('internal', 500)));

    expect(await screen.findByText('The conversation could not be loaded.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
