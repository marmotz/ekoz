import { EkozError } from '@ekozhq/sdk';
import { QueryClient } from '@tanstack/react-query';
import { screen, within } from '@testing-library/react';
import { toast } from 'sonner';
import { beforeEach, expect, it, vi } from 'vitest';

import { SessionsSection } from '@/features/profile/components/sessions-section';
import { type Configure, renderSignedIn } from '../../../../test/render-signed-in';
import { createClientMock } from '../../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));

const session = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  deviceName: `Device ${id}`,
  current: false,
  ip: '10.0.0.1',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  lastSeenAt: new Date('2026-01-01T00:00:00Z'),
  revokedAt: null,
  ...overrides,
});

function setup(sessions: unknown[], configure?: Configure) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    ...renderSignedIn(<SessionsSection />, {
      queryClient,
      configure: (fake) => {
        fake.stubs.sessions.list.mockImplementation(async () => sessions as never);
        configure?.(fake);
      },
    }),
    queryClient,
  };
}

const rows = () => screen.getAllByRole('listitem');

beforeEach(() => {
  createClientMock.mockReset();
  vi.mocked(toast.success).mockClear();
});

it('shows a skeleton while the list is loading', async () => {
  setup([], (fake) => fake.stubs.sessions.list.mockReturnValue(new Promise(() => {})));

  expect(await screen.findByTestId('sessions-skeleton')).toBeInTheDocument();
});

it('lists active sessions only, most recently seen first', async () => {
  setup([
    session('old', { lastSeenAt: new Date('2026-01-01T00:00:00Z') }),
    session('gone', { revokedAt: new Date('2026-02-01T00:00:00Z') }),
    session('new', { lastSeenAt: new Date('2026-03-01T00:00:00Z') }),
    session('mid', { lastSeenAt: new Date('2026-02-01T00:00:00Z') }),
  ]);

  await screen.findByText('Device new');

  expect(rows().map((row) => row.textContent)).toEqual([
    expect.stringContaining('Device new'),
    expect.stringContaining('Device mid'),
    expect.stringContaining('Device old'),
  ]);
  expect(screen.queryByText('Device gone')).not.toBeInTheDocument();
});

it('flags the current session and gives it no revoke button', async () => {
  setup([session('here', { current: true }), session('other')]);

  await screen.findByText('Device here');

  const [current, other] = rows() as [HTMLElement, HTMLElement];
  expect(within(current).getByText('This device')).toBeInTheDocument();
  expect(within(current).queryByRole('button', { name: /Revoke/ })).not.toBeInTheDocument();
  expect(within(current).getByRole('button', { name: /Rename/ })).toBeInTheDocument();
  expect(within(other).getByRole('button', { name: 'Revoke Device other' })).toBeInTheDocument();
});

it('renames a session inline', async () => {
  const { fake, user } = setup([session('a')]);

  await user.click(await screen.findByRole('button', { name: 'Rename Device a' }));
  const input = screen.getByLabelText('Device name');
  await user.clear(input);
  await user.type(input, 'Laptop');
  await user.click(screen.getByRole('button', { name: 'Save' }));

  await vi.waitFor(() =>
    expect(fake.stubs.sessions.rename).toHaveBeenCalledWith('a', { deviceName: 'Laptop' }),
  );
  await vi.waitFor(() => expect(screen.queryByLabelText('Device name')).not.toBeInTheDocument());
  expect(fake.stubs.sessions.list).toHaveBeenCalledTimes(2);
});

it('does not rename to an empty or too long name', async () => {
  const { fake, user } = setup([session('a')]);

  await user.click(await screen.findByRole('button', { name: 'Rename Device a' }));
  const input = screen.getByLabelText('Device name');
  await user.clear(input);
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByText('This field is required.')).toBeInTheDocument();

  await user.type(input, 'x'.repeat(101));
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByText('Use at most 100 characters.')).toBeInTheDocument();
  expect(fake.stubs.sessions.rename).not.toHaveBeenCalled();
});

it('leaves the rename form without saving', async () => {
  const { fake, user } = setup([session('a')]);

  await user.click(await screen.findByRole('button', { name: 'Rename Device a' }));
  await user.click(screen.getByRole('button', { name: 'Cancel' }));

  expect(screen.queryByLabelText('Device name')).not.toBeInTheDocument();
  expect(fake.stubs.sessions.rename).not.toHaveBeenCalled();
});

it('shows a rename error', async () => {
  const { user } = setup([session('a')], (fake) =>
    fake.stubs.sessions.rename.mockRejectedValue(new Error('boom')),
  );

  await user.click(await screen.findByRole('button', { name: 'Rename Device a' }));
  await user.type(screen.getByLabelText('Device name'), '!');
  await user.click(screen.getByRole('button', { name: 'Save' }));

  expect(await screen.findByText('Something went wrong. Try again.')).toBeInTheDocument();
});

it('revokes a session and refetches the list', async () => {
  const { fake, user } = setup([session('a')]);

  await user.click(await screen.findByRole('button', { name: 'Revoke Device a' }));

  await vi.waitFor(() => expect(fake.stubs.sessions.revoke).toHaveBeenCalledWith('a'));
  await vi.waitFor(() => expect(fake.stubs.sessions.list).toHaveBeenCalledTimes(2));
});

it('shows a revoke error', async () => {
  const { user } = setup([session('a')], (fake) =>
    fake.stubs.sessions.revoke.mockRejectedValue(new EkozError({ code: 'network', status: 0 })),
  );

  await user.click(await screen.findByRole('button', { name: 'Revoke Device a' }));

  expect(await screen.findByText('Something went wrong. Try again.')).toBeInTheDocument();
});

it('signs out the other sessions and reports how many', async () => {
  const { fake, user } = setup(
    [session('here', { current: true }), session('a'), session('b')],
    (f) => f.stubs.sessions.revokeAllOthers.mockResolvedValue({ revoked: 2 }),
  );

  await user.click(await screen.findByRole('button', { name: 'Sign out other sessions' }));

  await vi.waitFor(() => expect(fake.stubs.sessions.revokeAllOthers).toHaveBeenCalledTimes(1));
  expect(toast.success).toHaveBeenCalledWith('2 sessions signed out.');
});

it('reports a single revoked session in the singular', async () => {
  const { user } = setup([session('here', { current: true }), session('a')], (f) =>
    f.stubs.sessions.revokeAllOthers.mockResolvedValue({ revoked: 1 }),
  );

  await user.click(await screen.findByRole('button', { name: 'Sign out other sessions' }));

  await vi.waitFor(() => expect(toast.success).toHaveBeenCalledWith('1 session signed out.'));
});

it('offers no sign out of other sessions when the current one is alone', async () => {
  setup([session('here', { current: true })]);

  await screen.findByText('Device here');

  expect(screen.queryByRole('button', { name: 'Sign out other sessions' })).not.toBeInTheDocument();
});

it('shows an error when the list cannot be loaded', async () => {
  setup([], (fake) => fake.stubs.sessions.list.mockRejectedValue(new Error('offline')));

  expect(await screen.findByText('Something went wrong. Try again.')).toBeInTheDocument();
});
