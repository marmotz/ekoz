import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRegisterDtoForm } from 'api/react-tanstack/RegisterDto.form';
import { RegisterDtoSchema } from 'api/react-tanstack/zod/RegisterDto.schema';
import { expect, it } from 'vitest';
import { z } from 'zod';
import { AuthTextField } from '@/features/auth/components/auth-text-field';
import { FormError } from '@/features/auth/components/form-error';
import { renderWithProviders } from '../../../../test/render';

const MIN_LENGTH = 12;
const schema = RegisterDtoSchema.extend({ password: z.string().min(MIN_LENGTH) });

function RegisterForm({ serverError }: { serverError?: string }) {
  const form = useRegisterDtoForm({ schema });

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="email">
        {(field) => (
          <AuthTextField field={field} label="Email" type="email" serverError={serverError} />
        )}
      </form.Field>
      <form.Field name="password">
        {(field) => <AuthTextField field={field} label="Password" type="password" />}
      </form.Field>
      <button type="submit">Send</button>
    </form>
  );
}

it('links the label to the input', async () => {
  renderWithProviders(<RegisterForm />);

  expect(await screen.findByLabelText('Email')).toHaveAttribute('type', 'email');
  expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
});

it('shows no error before the first submission', async () => {
  const user = userEvent.setup();
  renderWithProviders(<RegisterForm />);

  await user.type(await screen.findByLabelText('Password'), 'short');

  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('translates the errors of the generated schema on submit', async () => {
  const user = userEvent.setup();
  renderWithProviders(<RegisterForm />);

  await user.type(await screen.findByLabelText('Email'), 'not-an-email');
  await user.click(screen.getByRole('button', { name: 'Send' }));

  expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
  expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
});

it('applies a schema refined at the call site', async () => {
  const user = userEvent.setup();
  renderWithProviders(<RegisterForm />);

  await user.type(await screen.findByLabelText('Password'), 'short');
  await user.click(screen.getByRole('button', { name: 'Send' }));

  expect(await screen.findByText('Use at least 12 characters.')).toBeInTheDocument();
});

it('clears the error once the value is fixed', async () => {
  const user = userEvent.setup();
  renderWithProviders(<RegisterForm />);

  const password = await screen.findByLabelText('Password');
  await user.type(password, 'short');
  await user.click(screen.getByRole('button', { name: 'Send' }));
  await screen.findByText('Use at least 12 characters.');

  await user.type(password, ' and much longer');

  expect(screen.queryByText('Use at least 12 characters.')).not.toBeInTheDocument();
});

it('shows a server error in place of the validation one', async () => {
  renderWithProviders(<RegisterForm serverError="This email address is already in use." />);

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'This email address is already in use.',
  );
  expect(screen.getByLabelText('Email')).toHaveAccessibleDescription(
    'This email address is already in use.',
  );
});

it('renders a form error, and nothing when there is none', async () => {
  const { rerender } = renderWithProviders(<FormError>Boom</FormError>);
  expect(await screen.findByRole('alert')).toHaveTextContent('Boom');

  rerender(<FormError>{null}</FormError>);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
