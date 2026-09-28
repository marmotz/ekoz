import { EkozError } from '@ekozhq/sdk';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, expect, it, vi } from 'vitest';

import { createI18n } from '@/app/i18n';
import { ThemeProvider } from '@/app/theme';
import { NewConversationPage } from '@/features/direct-messages/components/new-conversation-page';
import { SidebarConversations } from '@/features/direct-messages/components/sidebar-conversations';
import { Route as DmsLayout } from '@/routes/_app/dms';
import { Route as ConversationRoute } from '@/routes/_app/dms/$roomId';
import { Route as SettingsRoute } from '@/routes/_app/dms/$roomId/settings';
import { Route as DmsIndex } from '@/routes/_app/dms/index';
import { Route as DmsNew } from '@/routes/_app/dms/new';
import { getSidebarSections } from '@/shared/layout/sidebar-section-registry';
import { SdkProvider } from '@/shared/sdk/provider';
import { conversationItem, participant } from '../../../test/conversation-fixtures';
import { createClientMock, createFakeSdk } from '../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

beforeEach(() => {
  createClientMock.mockReset();
  Element.prototype.scrollIntoView = vi.fn();
});

/**
 * The `_app` layout and the root route need the TanStack Start runtime, so the page routes
 * are re-parented under a bare root: what is under test is the routes' own composition.
 */
function renderConversation(
  path: string,
  {
    group = false,
    configure,
  }: { group?: boolean; configure?: (fake: ReturnType<typeof createFakeSdk>) => void } = {},
) {
  const fake = createFakeSdk({ identifier: 'jane/example.test', sessionId: 's1' });
  fake.stubs.conversations.list.mockResolvedValue({
    items: [
      group
        ? conversationItem({
            id: 'c1',
            type: 'group_dm',
            name: 'Trip',
            isAdmin: true,
            participants: [participant('u2', 'Bob')],
          })
        : conversationItem({ id: 'c1', participants: [participant('u2', 'Bob')] }),
    ],
  });
  fake.stubs.rooms.myPermissions.mockResolvedValue({
    capabilities: ['room.read', 'room.post', 'room.manage_members'],
  });
  fake.stubs.messages.list.mockResolvedValue({
    items: [
      {
        id: 'm1',
        roomId: 'c1',
        seq: '1',
        authorId: 'u2',
        body: 'hello from Bob',
        replyToId: null,
        mentions: [],
        editedAt: null,
        redactedAt: null,
        hiddenAt: null,
        createdAt: '2026-01-01T10:00:00.000Z',
        attachments: [],
        linkPreview: null,
      },
    ],
    lastSeq: '1',
    hasMore: false,
  } as never);
  configure?.(fake);
  createClientMock.mockReturnValue(fake.sdk);

  const rootRoute = createRootRoute();
  const conversation = ConversationRoute.update({
    id: '/dms/$roomId',
    path: '/dms/$roomId',
    getParentRoute: () => rootRoute,
  } as never);
  const settings = SettingsRoute.update({
    id: '/settings',
    path: '/settings',
    getParentRoute: () => conversation,
  } as never);
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      (conversation as unknown as typeof ConversationRoute).addChildren([
        settings as never,
      ]) as never,
    ]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <I18nextProvider i18n={createI18n('en')}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <SdkProvider>
            <RouterProvider router={router} />
          </SdkProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </I18nextProvider>,
  );

  return { fake, router };
}

it('registers the conversations in the sidebar, below the rooms tree', () => {
  expect(getSidebarSections()).toContainEqual(
    expect.objectContaining({ id: 'direct-messages', order: 20, component: SidebarConversations }),
  );
});

it('titles the pages and serves the picker', () => {
  expect(DmsLayout.options.staticData?.title).toBe('directMessages.title');
  expect(ConversationRoute.options.staticData?.title).toBe('directMessages.title');
  expect(SettingsRoute.options.staticData?.title).toBe('directMessages.settings.title');
  expect(DmsNew.options.staticData?.title).toBe('directMessages.new.title');
  expect(DmsNew.options.component).toBe(NewConversationPage);
});

it('sends /dms to the picker', () => {
  expect(() => DmsIndex.options.beforeLoad?.({} as never)).toThrow();
});

it('composes the gate, the header and the chat for the conversation in the URL', async () => {
  const fake = renderConversation('/dms/c1').fake;

  expect(await screen.findByText('hello from Bob')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Bob' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Delete the conversation' })).toBeInTheDocument();
  expect(fake.stubs.messages.list).toHaveBeenCalledWith('c1');
  expect(screen.getByRole('textbox', { name: 'Message' })).toBeEnabled();
});

it('shows "not available" for a conversation that cannot be read', async () => {
  renderConversation('/dms/c1', {
    configure: ({ stubs }) => {
      stubs.conversations.list.mockResolvedValue({ items: [] });
      stubs.rooms.get.mockRejectedValue(new EkozError({ code: 'room.not_found', status: 404 }));
    },
  });

  expect(await screen.findByText('Conversation unavailable')).toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: 'Message' })).not.toBeInTheDocument();
});

it('renders the group settings under the same header', async () => {
  renderConversation('/dms/c1/settings', { group: true });

  expect(await screen.findByRole('heading', { name: 'Group settings' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Trip' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: 'Message' })).not.toBeInTheDocument();
});
