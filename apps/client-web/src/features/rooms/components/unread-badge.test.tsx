import { screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { UnreadBadge } from '@/features/rooms/components/unread-badge';
import { renderWithProviders } from '../../../../test/render';

it.each([null, 0])('renders nothing for %s', (count) => {
  renderWithProviders(<UnreadBadge count={count} />);

  expect(screen.queryByRole('status')).toBeNull();
});

it('shows the number with an accessible label', async () => {
  renderWithProviders(<UnreadBadge count={5} />);

  const badge = await screen.findByRole('status', { name: '5 unread messages' });
  expect(badge).toHaveTextContent('5');
});

it('uses the singular for one message', async () => {
  renderWithProviders(<UnreadBadge count={1} />);

  expect(await screen.findByRole('status', { name: '1 unread message' })).toHaveTextContent('1');
});

it('shows 99 as is', async () => {
  renderWithProviders(<UnreadBadge count={99} />);

  expect(await screen.findByRole('status')).toHaveTextContent(/^99$/);
});

it('shows 99+ from 100', async () => {
  renderWithProviders(<UnreadBadge count={100} />);

  expect(await screen.findByRole('status')).toHaveTextContent('99+');
});
