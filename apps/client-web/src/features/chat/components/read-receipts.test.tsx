import { screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { ReadReceipts } from '@/features/chat/components/read-receipts';
import type { Author } from '@/features/chat/hooks/use-authors';
import { renderWithProviders } from '../../../../test/render';

const reader = (id: string, displayName: string): Author => ({
  kind: 'member',
  userId: id,
  identifier: null,
  displayName,
  avatarUrl: null,
  role: 'member',
});

const readers = (count: number) =>
  Array.from({ length: count }, (_, index) => reader(`u${index}`, `User ${index}`));

it('renders nothing without readers', () => {
  renderWithProviders(<ReadReceipts readers={[]} />);

  expect(screen.queryByRole('group')).toBeNull();
});

it('labels the avatars with every name', async () => {
  renderWithProviders(<ReadReceipts readers={[reader('a', 'Alice'), reader('b', 'Bob')]} />);

  const group = await screen.findByRole('group', { name: 'Read by Alice, Bob' });
  expect(group.querySelectorAll('span.relative')).toHaveLength(2);
  expect(group).not.toHaveTextContent('+');
});

it('draws five avatars and collapses the others into +N', async () => {
  renderWithProviders(<ReadReceipts readers={readers(8)} />);

  const group = await screen.findByRole('group');
  expect(group).toHaveTextContent('+3');
  expect(group.querySelectorAll('span.relative')).toHaveLength(5);
  expect(group).toHaveAccessibleName(/User 0.*User 7/);
});

it('shows exactly five avatars for five readers, without +N', async () => {
  renderWithProviders(<ReadReceipts readers={readers(5)} />);

  const group = await screen.findByRole('group');
  expect(group.querySelectorAll('span.relative')).toHaveLength(5);
  expect(group).not.toHaveTextContent('+');
});

it('says everyone has read when all the other members are readers', async () => {
  renderWithProviders(<ReadReceipts readers={readers(8)} audienceSize={8} />);

  expect(await screen.findByText('Read by everyone')).toBeInTheDocument();
  expect(screen.queryByRole('group')).toBeNull();
});

it('keeps the avatars while some members have not read', async () => {
  renderWithProviders(<ReadReceipts readers={readers(2)} audienceSize={3} />);

  expect(await screen.findByRole('group')).toBeInTheDocument();
  expect(screen.queryByText('Read by everyone')).toBeNull();
});
