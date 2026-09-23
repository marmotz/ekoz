import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';

import { PasswordInput } from '@/shared/ui/password-input';
import { renderWithProviders } from '../../../test/render';

it('hides the password by default', async () => {
  renderWithProviders(<PasswordInput aria-label="Password" />);

  expect(await screen.findByLabelText('Password')).toHaveAttribute('type', 'password');
  expect(screen.getByRole('button', { name: 'Show password' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});

it('toggles between hidden and visible', async () => {
  const user = userEvent.setup();
  renderWithProviders(<PasswordInput aria-label="Password" defaultValue="secret" />);

  await user.click(await screen.findByRole('button', { name: 'Show password' }));
  expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text');
  expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await user.click(screen.getByRole('button', { name: 'Hide password' }));
  expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
});

it('does not submit the form when toggled', async () => {
  const user = userEvent.setup();
  let submitted = false;
  renderWithProviders(
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submitted = true;
      }}
    >
      <PasswordInput aria-label="Password" />
    </form>,
  );

  await user.click(await screen.findByRole('button', { name: 'Show password' }));

  expect(submitted).toBe(false);
});

it('labels the toggle in French', async () => {
  renderWithProviders(<PasswordInput aria-label="Mot de passe" />, { language: 'fr' });

  expect(
    await screen.findByRole('button', { name: 'Afficher le mot de passe' }),
  ).toBeInTheDocument();
});
