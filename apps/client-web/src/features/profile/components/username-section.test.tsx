import { EkozError } from '@ekozhq/sdk';
import { QueryClient } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import { toast } from 'sonner';
import { beforeEach, expect, it, vi } from 'vitest';

import { UsernameSection } from '@/features/profile/components/username-section';
import { type Configure, renderSignedIn } from '../../../../test/render-signed-in';
import { createClientMock, defaultMe } from '../../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));

const state = (overrides: Record<string, unknown> = {}) => ({
  policy: 'available',
  nextChangeAt: null,
  pendingRequest: null,
  ...overrides,
});

function setup(usernameState: unknown, configure?: Configure) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rendered = renderSignedIn(<UsernameSection me={defaultMe as never} />, {
    queryClient,
    configure: (fake) => {
      fake.stubs.me.usernameState.mockResolvedValue(usernameState as never);
      configure?.(fake);
    },
  });
  return { ...rendered, queryClient };
}

const submit = () => screen.findByRole('button', { name: 'Change the username' });

beforeEach(() => {
  createClientMock.mockReset();
  vi.mocked(toast.success).mockClear();
});

it('shows the identifier and the static server suffix', async () => {
  setup(state());

  expect(await screen.findByText('@jane/example.test')).toBeInTheDocument();
  expect(await screen.findByText('/example.test')).toBeInTheDocument();
});

it('shows a skeleton while the state is loading', async () => {
  setup(new Promise(() => {}));

  expect(await screen.findByTestId('username-skeleton')).toBeInTheDocument();
});

it('shows a read-only note when the policy is immutable', async () => {
  setup(state({ policy: 'immutable' }));

  expect(
    await screen.findByText('The username of this account cannot be changed.'),
  ).toBeInTheDocument();
  expect(screen.queryByLabelText('Username')).not.toBeInTheDocument();
});

it('shows the form without note when the policy is available', async () => {
  setup(state());

  expect(await screen.findByLabelText('Username')).toBeEnabled();
  expect(screen.queryByText(/approved by an administrator/)).not.toBeInTheDocument();
});

it('shows the form with an approval note when the policy is approval', async () => {
  setup(state({ policy: 'approval' }));

  expect(await screen.findByText(/approved by an administrator/)).toBeInTheDocument();
  expect(screen.getByLabelText('Username')).toBeEnabled();
});

it('disables the form with the date while the next change is in the future', async () => {
  setup(state({ nextChangeAt: new Date('2999-01-15T12:00:00Z') }));

  expect(await screen.findByText(/again on January 15, 2999/)).toBeInTheDocument();
  expect(screen.getByLabelText('Username')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Change the username' })).toBeDisabled();
});

it('enables the form once the next change date is past', async () => {
  setup(state({ nextChangeAt: new Date('2000-01-01T00:00:00Z') }));

  expect(await screen.findByLabelText('Username')).toBeEnabled();
});

it('replaces the form by the pending request and its cancellation', async () => {
  setup(state({ pendingRequest: { id: 'r1', requestedName: 'janet' } }));

  expect(await screen.findByText('Awaiting approval for janet.')).toBeInTheDocument();
  expect(screen.queryByLabelText('Username')).not.toBeInTheDocument();
});

it('cancels the pending request and refetches the state', async () => {
  const { fake, user } = setup(state({ pendingRequest: { id: 'r1', requestedName: 'janet' } }));
  await screen.findByText('Awaiting approval for janet.');
  fake.stubs.me.usernameState.mockResolvedValue(state() as never);

  await user.click(screen.getByRole('button', { name: 'Cancel the request' }));

  await vi.waitFor(() => expect(fake.stubs.me.cancelUsernameRequest).toHaveBeenCalledTimes(1));
  expect(await screen.findByLabelText('Username')).toBeInTheDocument();
});

it('shows an error when the cancellation fails', async () => {
  const { user } = setup(state({ pendingRequest: { id: 'r1', requestedName: 'janet' } }), (fake) =>
    fake.stubs.me.cancelUsernameRequest.mockRejectedValue(new Error('boom')),
  );

  await user.click(await screen.findByRole('button', { name: 'Cancel the request' }));

  expect(await screen.findByText('Something went wrong. Try again.')).toBeInTheDocument();
});

it('sends the bare name and refetches the account and the state when applied', async () => {
  const { fake, user, queryClient } = setup(state());
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

  await user.type(await screen.findByLabelText('Username'), 'janet');
  await user.click(await submit());

  await vi.waitFor(() =>
    expect(fake.stubs.me.changeUsername).toHaveBeenCalledWith({ name: 'janet' }),
  );
  await vi.waitFor(() => expect(toast.success).toHaveBeenCalledWith('Username changed.'));
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['me'] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['account', 'username-state'] });
});

it('refetches only the state when the change is pending approval', async () => {
  const { fake, user, queryClient } = setup(state({ policy: 'approval' }), (f) =>
    f.stubs.me.changeUsername.mockResolvedValue({ status: 'pending', requestId: 'r1' } as never),
  );
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

  await user.type(await screen.findByLabelText('Username'), 'janet');
  await user.click(await submit());

  await vi.waitFor(() =>
    expect(toast.success).toHaveBeenCalledWith('Change requested, awaiting approval.'),
  );
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['account', 'username-state'] });
  expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ['me'] });
  expect(fake.stubs.me.changeUsername).toHaveBeenCalledTimes(1);
});

it.each([
  ['identity.identifier_invalid', /lowercase letters, digits/],
  ['identity.username_taken', 'This username is not available.'],
])('shows %s under the field', async (code, message) => {
  const { user } = setup(state(), (fake) =>
    fake.stubs.me.changeUsername.mockRejectedValue(new EkozError({ code, status: 422 })),
  );

  const input = await screen.findByLabelText('Username');
  await user.type(input, 'Bad Name');
  await user.click(await submit());

  const error = await screen.findByText(message);
  expect(input).toHaveAccessibleDescription(error.textContent ?? '');
});

it.each([
  ['identity.username_immutable', 'The username of this account cannot be changed.'],
  ['identity.username_change_cooldown', /changed your username recently/],
  ['identity.username_request_pending', /already awaiting approval/],
])('shows %s and refetches the state', async (code, message) => {
  const { fake, user } = setup(state(), (f) =>
    f.stubs.me.changeUsername.mockRejectedValue(new EkozError({ code, status: 409 })),
  );

  await user.type(await screen.findByLabelText('Username'), 'janet');
  await user.click(await submit());

  await vi.waitFor(() => expect(fake.stubs.me.usernameState).toHaveBeenCalledTimes(2));
  expect(await screen.findAllByText(message)).not.toHaveLength(0);
});
