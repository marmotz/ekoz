import { act, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SidebarConversations } from '@/features/direct-messages/components/sidebar-conversations';
import { markUnseen, resetUnseen } from '@/features/direct-messages/lib/unseen-store';
import { SdkProvider } from '@/shared/sdk/provider';
import { conversationItem, participant } from '../../../../test/conversation-fixtures';
import { renderWithProviders } from '../../../../test/render';
import { type Configure, renderSignedIn } from '../../../../test/render-signed-in';
import { createClientMock, createFakeSdk } from '../../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

const items = [
  conversationItem({ id: 'c1', participants: [participant('u2', 'Bob')] }),
  conversationItem({
    id: 'c2',
    type: 'group_dm',
    name: 'Trip',
    participants: [participant('u3', 'Carol'), participant('u4', 'Dan')],
  }),
  conversationItem({
    id: 'c3',
    type: 'group_dm',
    participants: [participant('u5', 'Eve'), participant('u6', 'Fay')],
  }),
];

const withConversations: Configure = ({ stubs }) => {
  stubs.conversations.list.mockResolvedValue({ items });
};

beforeEach(() => {
  createClientMock.mockReset();
  resetUnseen();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SidebarConversations', () => {
  it('lists the conversations in server order, named after the other person, the group or its participants', async () => {
    renderSignedIn(<SidebarConversations />, { configure: withConversations });

    const names = ['Bob', 'Trip', 'Eve, Fay'];
    await screen.findByText('Bob');

    const rows = names.map((name) => screen.getByText(name).closest('a'));
    expect(rows.map((row) => row?.getAttribute('href'))).toEqual(['/dms/c1', '/dms/c2', '/dms/c3']);
    const order = screen.getAllByRole('listitem').map((item) => item.textContent);
    expect(order.map((text) => names.find((name) => text?.endsWith(name)))).toEqual(names);
  });

  it('links to the new conversation page', async () => {
    renderSignedIn(<SidebarConversations />, { configure: withConversations });

    expect(await screen.findByRole('link', { name: 'New' })).toHaveAttribute('href', '/dms/new');
  });

  it('shows an empty state without conversations', async () => {
    renderSignedIn(<SidebarConversations />);

    expect(await screen.findByText(/No conversation yet/)).toBeInTheDocument();
  });

  it('shows an error when the list cannot be loaded', async () => {
    renderSignedIn(<SidebarConversations />, {
      configure: ({ stubs }) => stubs.conversations.list.mockRejectedValue(new Error('boom')),
    });

    expect(await screen.findByText('The conversations could not be loaded.')).toBeInTheDocument();
  });

  it('shows the unseen dot on a conversation with a message not seen yet', async () => {
    renderSignedIn(<SidebarConversations />, { configure: withConversations });
    await screen.findByText('Bob');

    expect(screen.queryByRole('status', { name: 'New messages' })).not.toBeInTheDocument();
    act(() => markUnseen('c2'));

    const link = await screen.findByRole('link', { name: /Trip/ });
    expect(within(link).getByRole('status', { name: 'New messages' })).toBeInTheDocument();
    expect(
      within(screen.getByText('Bob').closest('a') as HTMLElement).queryByRole('status'),
    ).toBeNull();
  });

  it('renders nothing while signed out', () => {
    const fake = createFakeSdk();
    createClientMock.mockReturnValue(fake.sdk);
    const { container } = renderWithProviders(
      <SdkProvider>
        <SidebarConversations />
      </SdkProvider>,
    );

    expect(container.querySelector('#sidebar-conversations-title')).toBeNull();
    expect(fake.stubs.conversations.list).not.toHaveBeenCalled();
  });
});
