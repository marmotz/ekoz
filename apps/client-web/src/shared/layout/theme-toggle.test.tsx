import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import { ThemeToggle } from '@/shared/layout/theme-toggle';
import { renderWithProviders } from '../../../test/render';

vi.mock('@/shared/ui/dropdown-menu', () => import('../../../test/dropdown-menu-mock'));

it('reports the chosen theme', async () => {
  const user = userEvent.setup();
  const onThemeChange = vi.fn();
  renderWithProviders(<ThemeToggle theme="system" onThemeChange={onThemeChange} />);

  await user.click(await screen.findByRole('menuitem', { name: 'Dark' }));

  expect(onThemeChange).toHaveBeenCalledExactlyOnceWith('dark');
});

it('translates its labels', async () => {
  renderWithProviders(<ThemeToggle theme="light" onThemeChange={() => {}} />, { language: 'fr' });

  expect(await screen.findByRole('menuitem', { name: 'Sombre' })).toBeInTheDocument();
});
