import type { UnreadMentionsResponse } from '@ekozhq/sdk';
import { QueryClient } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';

import { MenuUnreadBadge } from '@/shared/layout/menu-unread-badge';
import {
  clearSidebarSectionRegistry,
  registerSidebarSection,
} from '@/shared/layout/sidebar-section-registry';
import { unreadMentionsKey } from '@/shared/mentions/unread-mentions';
import { renderWithProviders } from '../../../test/render';

const noop = () => null;

function withMentions(items: UnreadMentionsResponse['items']) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(unreadMentionsKey, { items });
  return queryClient;
}

beforeEach(() => {
  clearSidebarSectionRegistry();
});

it('renders nothing without unread messages or mentions', () => {
  registerSidebarSection({ id: 'a', component: noop, useUnreadCount: () => 0 });
  registerSidebarSection({ id: 'b', component: noop });

  renderWithProviders(<MenuUnreadBadge />, { queryClient: withMentions([]) });

  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

it('shows the sum of the unread messages in a grey badge, bottom right', async () => {
  registerSidebarSection({ id: 'a', component: noop, useUnreadCount: () => 3 });
  registerSidebarSection({ id: 'b', component: noop, useUnreadCount: () => 4 });

  renderWithProviders(<MenuUnreadBadge />, { queryClient: withMentions([]) });

  const badge = await screen.findByRole('status', { name: '7 unread messages' });
  expect(badge).toHaveTextContent('7');
  expect(badge).toHaveClass('bg-secondary', 'bottom-0');
});

it('caps the number at 99+', async () => {
  registerSidebarSection({ id: 'a', component: noop, useUnreadCount: () => 250 });

  renderWithProviders(<MenuUnreadBadge />, { queryClient: withMentions([]) });

  expect(await screen.findByRole('status')).toHaveTextContent('99+');
});

it('shows a filled dark badge, top right, when a mention names the caller', async () => {
  renderWithProviders(<MenuUnreadBadge />, {
    queryClient: withMentions([
      { roomId: 'a', direct: 1, collective: 1 },
      { roomId: 'b', direct: 0, collective: 2 },
    ]),
  });

  const badge = await screen.findByRole('status');
  expect(badge).toHaveTextContent('4');
  expect(badge).toHaveAttribute('data-menu-mention-badge', 'direct');
  expect(badge).toHaveClass('bg-primary', 'top-0');
});

it('outlines the badge when every mention is collective', async () => {
  renderWithProviders(<MenuUnreadBadge />, {
    queryClient: withMentions([{ roomId: 'a', direct: 0, collective: 2 }]),
  });

  expect(await screen.findByRole('status')).toHaveAttribute(
    'data-menu-mention-badge',
    'collective',
  );
});
