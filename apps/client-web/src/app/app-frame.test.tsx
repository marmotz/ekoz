import { screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { AppFrame } from '@/app/app-frame';
import { renderWithProviders } from '../../test/render';

it('renders its children inside the shell', async () => {
  renderWithProviders(
    <AppFrame>
      <p>page</p>
    </AppFrame>,
  );

  expect(await screen.findByText('page')).toBeInTheDocument();
  expect(await screen.findByRole('button', { name: 'Theme' })).toBeInTheDocument();
});

it('forwards the user menu to the top bar slot', async () => {
  renderWithProviders(
    <AppFrame userMenu={<p>the user menu</p>}>
      <p>page</p>
    </AppFrame>,
  );

  expect(await screen.findByText('the user menu')).toBeInTheDocument();
});
