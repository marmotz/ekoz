import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';

import { LANGUAGE_STORAGE_KEY } from '@/shared/i18n/config';
import { LanguageSwitcher } from '@/shared/layout/language-switcher';
import { renderWithProviders } from '../../../test/render';

vi.mock('@/shared/ui/dropdown-menu', () => import('../../../test/dropdown-menu-mock'));

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.lang = 'en';
});

it('switches language, persists it and updates <html lang>', async () => {
  const user = userEvent.setup();
  const { i18n } = renderWithProviders(<LanguageSwitcher />);

  await user.click(await screen.findByRole('menuitem', { name: 'French' }));

  expect(i18n.language).toBe('fr');
  expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('fr');
  expect(document.documentElement.lang).toBe('fr');
});

it('shows the current language on the trigger', async () => {
  renderWithProviders(<LanguageSwitcher />, { language: 'fr' });

  expect(await screen.findByRole('button', { name: 'Langue' })).toHaveTextContent('FR');
});
