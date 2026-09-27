import { EkozError } from '@ekozhq/sdk';
import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Editor } from '@tiptap/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { Composer } from '@/features/chat/components/composer';
import { useSendMessage } from '@/features/chat/hooks/use-send-message';
import { SdkProvider } from '@/shared/sdk/provider';
import { SdkContext } from '@/shared/sdk/use-sdk';
import { renderWithProviders } from '../../../../test/render';
import { createClientMock, createFakeSdk } from '../../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);
vi.mock('@/shared/ui/popover', () => import('../../../../test/popover-mock'));
vi.mock('@/shared/ui/tooltip', () => import('../../../../test/tooltip-mock'));

type Policy = { bodyMaxLength: number };

function setup(policy: () => Promise<Policy>) {
  const fake = createFakeSdk({ identifier: 'jane/example.test', sessionId: 's1' });
  fake.stubs.rooms.members.mockResolvedValue({ items: [], nextCursor: null } as never);
  fake.stubs.messages.policy.mockImplementation(policy);
  createClientMock.mockReturnValue(fake.sdk);

  const onSend = vi.fn();
  const rendered = renderWithProviders(
    <SdkProvider>
      <Composer roomId="r1" allowCollective block={null} onSend={onSend} />
    </SdkProvider>,
  );
  return { fake, onSend, user: userEvent.setup(), ...rendered };
}

const withLimit = (bodyMaxLength: number) => () => Promise.resolve({ bodyMaxLength });
const input = () => screen.findByRole('textbox', { name: 'Message' });
const counter = () => screen.queryByRole('status', { name: 'Message length' });

beforeEach(() => {
  createClientMock.mockReset();
});

it('asks the server for the limit once', async () => {
  const { fake, user } = setup(withLimit(100));
  await user.type(await input(), 'hello');

  await waitFor(() => expect(fake.stubs.messages.policy).toHaveBeenCalledTimes(1));
});

it('shows no counter below 80 % of the limit', async () => {
  const { fake, user } = setup(withLimit(10));
  await waitFor(() => expect(fake.stubs.messages.policy).toHaveBeenCalled());

  await user.type(await input(), 'abcdefg');

  expect(counter()).toBeNull();
});

it('shows used / max from 80 % of the limit', async () => {
  const { user } = setup(withLimit(10));

  await user.type(await input(), 'abcdefgh');

  expect(await screen.findByRole('status', { name: 'Message length' })).toHaveTextContent('8 / 10');
});

it('still sends at exactly the limit', async () => {
  const { onSend, user } = setup(withLimit(10));
  await user.type(await input(), 'abcdefghij');

  expect(await screen.findByRole('status')).toHaveTextContent('10 / 10');
  expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
  await user.keyboard('{Enter}');

  expect(onSend).toHaveBeenCalledWith({ body: 'abcdefghij', mentions: [], attachments: [] });
});

it('turns to the error tone and blocks the button and Enter over the limit', async () => {
  const { onSend, user } = setup(withLimit(10));
  await user.type(await input(), 'abcdefghijk');

  const status = await screen.findByRole('status');
  expect(status).toHaveTextContent('11 / 10');
  expect(status).toHaveTextContent('too long');
  expect(status).toHaveClass('text-destructive');
  expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();

  await user.keyboard('{Enter}');

  expect(onSend).not.toHaveBeenCalled();
  expect((await input()).textContent).toBe('abcdefghijk');
});

it('sends again once the text is short enough', async () => {
  const { onSend, user } = setup(withLimit(10));
  await user.type(await input(), 'abcdefghijk');
  await screen.findByRole('status');

  const editor = ((await input()) as HTMLElement & { editor: Editor }).editor;
  editor.commands.deleteRange({ from: 11, to: 12 });
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('10 / 10'));
  await user.keyboard('{Enter}');

  expect(onSend).toHaveBeenCalledWith({ body: 'abcdefghij', mentions: [], attachments: [] });
});

it('counts the Markdown that is sent, not the visible text', async () => {
  const { user } = setup(withLimit(10));

  // Bold text `abcd` is sent as `**abcd**`: 8 characters.
  await user.type(await input(), '**abcd**');

  expect(await screen.findByRole('status')).toHaveTextContent('8 / 10');
});

it('has no counter and no block while the policy is loading', async () => {
  const { onSend, user } = setup(() => new Promise<Policy>(() => {}));

  await user.type(await input(), 'a message that would be too long for a tiny limit{Enter}');

  expect(counter()).toBeNull();
  expect(onSend).toHaveBeenCalledTimes(1);
});

it('has no counter and no block when the policy failed', async () => {
  const { fake, onSend, user } = setup(() => Promise.reject(new Error('down')));
  await waitFor(() => expect(fake.stubs.messages.policy).toHaveBeenCalled());

  await user.type(await input(), 'a message that would be too long for a tiny limit{Enter}');

  expect(counter()).toBeNull();
  expect(onSend).toHaveBeenCalledTimes(1);
});

it('refetches the limit after a send is refused as too long', async () => {
  const { fake, queryClient, user } = setup(withLimit(16_000));
  await user.type(await input(), 'hello');
  await waitFor(() => expect(fake.stubs.messages.policy).toHaveBeenCalledTimes(1));
  fake.stubs.messages.policy.mockImplementation(withLimit(5));
  fake.stubs.messages.send.mockRejectedValue(
    new EkozError({ code: 'message.body_too_long', status: 422 }),
  );
  const { result } = renderHook(() => useSendMessage('r1'), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>
        <SdkContext.Provider value={fake.sdk}>{children}</SdkContext.Provider>
      </QueryClientProvider>
    ),
  });
  await result.current.send({ body: 'hello', mentions: [], attachments: [] });

  await waitFor(() => expect(fake.stubs.messages.policy).toHaveBeenCalledTimes(2));
  expect(await screen.findByRole('status')).toHaveTextContent('5 / 5');
});
