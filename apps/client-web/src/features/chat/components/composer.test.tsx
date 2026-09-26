import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';

import { Composer, type ComposerProps } from '@/features/chat/components/composer';
import { roomGroupsKey } from '@/shared/groups/room-groups';
import { SdkProvider } from '@/shared/sdk/provider';
import { renderWithProviders } from '../../../../test/render';
import { createClientMock, createFakeSdk } from '../../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

const member = (id: string, name: string) => ({
  role: 'member',
  joinedAt: '2026-01-01T00:00:00.000Z',
  user: {
    id,
    identifier: `${name.toLowerCase()}/example.test`,
    displayName: name,
    avatarUrl: null,
  },
});

const group = (id: string, name: string) => ({
  id,
  nodeId: 'r1',
  name,
  memberCount: 3,
  inherited: false,
  isMember: true,
});

function setup(props: Partial<ComposerProps> = {}) {
  const fake = createFakeSdk({ identifier: 'jane/example.test', sessionId: 's1' });
  fake.stubs.rooms.members.mockResolvedValue({
    items: [member('u1', 'Alice'), member('u2', 'Bob'), member('u3', 'Alina')],
    nextCursor: null,
  } as never);
  fake.stubs.groups.list.mockResolvedValue({ items: [group('g1', 'design')] } as never);
  createClientMock.mockReturnValue(fake.sdk);

  const onSend = vi.fn();
  const { queryClient } = renderWithProviders(
    <SdkProvider>
      <Composer roomId="r1" allowCollective block={null} onSend={onSend} {...props} />
    </SdkProvider>,
  );
  return { fake, onSend, queryClient, user: userEvent.setup() };
}

const editor = () => screen.findByRole('textbox', { name: 'Message' });
const listbox = () => screen.findByRole('listbox', { name: 'Mention suggestions' });
const options = () => screen.getAllByRole('option').map((option) => option.textContent);

beforeEach(() => {
  createClientMock.mockReset();
});

it('shows a disabled placeholder until the editor is mounted, then the editor', async () => {
  setup();

  expect(await editor()).toHaveAttribute('contenteditable', 'true');
});

it('focuses the editor by default once it is usable', async () => {
  setup();

  await waitFor(async () => expect(await editor()).toHaveFocus());
});

it('does not focus the editor when writing is blocked', async () => {
  setup({ block: 'read_only' });

  expect(await editor()).not.toHaveFocus();
});

it('sends the Markdown body with Enter and clears the editor', async () => {
  const { onSend, user } = setup();

  await user.type(await editor(), 'hello **world**{Enter}');

  expect(onSend).toHaveBeenCalledWith({ body: 'hello **world**', mentions: [] });
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: 'Message' }).textContent).toBe(''),
  );
});

it('inserts a line break with Shift+Enter instead of sending', async () => {
  const { onSend, user } = setup();

  await user.type(await editor(), 'one{Shift>}{Enter}{/Shift}two');

  expect(onSend).not.toHaveBeenCalled();
  expect((await editor()).querySelector('br')).not.toBeNull();
});

it('never sends a blank input', async () => {
  const { onSend, user } = setup();

  await user.type(await editor(), '   {Enter}');

  expect(onSend).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
});

it('sends with the button once there is text', async () => {
  const { onSend, user } = setup();
  await user.type(await editor(), 'hi');

  await user.click(screen.getByRole('button', { name: 'Send' }));

  expect(onSend).toHaveBeenCalledWith({ body: 'hi', mentions: [] });
});

it('does not accept input while blocked or loading', async () => {
  setup({ block: 'read_only' });

  expect(await editor()).toHaveAttribute('contenteditable', 'false');
  expect(screen.getByText('This room is read-only.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
});

it('opens the suggestions on @ and filters on display name and identifier, case-insensitively', async () => {
  const { user } = setup();
  await user.type(await editor(), '@');

  await listbox();
  expect(options().some((text) => text?.startsWith('Alice'))).toBe(true);

  await user.type(await editor(), 'ALI');
  await waitFor(() => expect(options()).toHaveLength(2));
  expect(options()).toEqual(['Alicealice/example.test', 'Alinaalina/example.test']);

  await user.type(await editor(), 'ce/EXAMPLE');
  await waitFor(() => expect(options()).toEqual(['Alicealice/example.test']));
});

it('lists people, groups, roles and @all in sections', async () => {
  const { user } = setup();
  await user.type(await editor(), '@');
  await listbox();

  const titles = ['People', 'Groups', 'Roles', 'Everyone'];
  for (const title of titles) expect(screen.getByText(title)).toBeInTheDocument();
  expect(options()).toEqual(
    expect.arrayContaining([
      expect.stringContaining('design'),
      expect.stringContaining('space-admins'),
      expect.stringContaining('readers'),
      'everyone',
    ]),
  );
});

it('offers people only in a room that does not allow collective mentions', async () => {
  const { user } = setup({ allowCollective: false });
  await user.type(await editor(), '@');
  await listbox();

  expect(screen.getByText('People')).toBeInTheDocument();
  for (const title of ['Groups', 'Roles', 'Everyone']) {
    expect(screen.queryByText(title)).not.toBeInTheDocument();
  }
});

it('picks a suggestion with Enter, turns it into a chip and sends its token and target', async () => {
  const { onSend, user } = setup();
  await user.type(await editor(), 'hi @bo');
  await listbox();

  await user.keyboard('{Enter}');

  expect(onSend).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  const chip = (await editor()).querySelector('[data-type="mention"]');
  expect(chip).toHaveTextContent('@Bob');

  await user.keyboard('ok{Enter}');

  expect(onSend).toHaveBeenCalledWith({
    body: 'hi @bob/example.test ok',
    mentions: [{ type: 'user', target: 'u2', token: '@bob/example.test' }],
  });
});

it('navigates with the arrow keys and picks with Tab', async () => {
  const { onSend, user } = setup();
  await user.type(await editor(), '@ali');
  await listbox();
  await waitFor(() => expect(options()).toHaveLength(2));

  await user.keyboard('{ArrowDown}');
  expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');
  await user.keyboard('{Tab}');
  await user.keyboard('x{Enter}');

  expect(onSend).toHaveBeenCalledWith({
    body: '@alina/example.test x',
    mentions: [{ type: 'user', target: 'u3', token: '@alina/example.test' }],
  });
});

it('wraps around with ArrowUp', async () => {
  const { user } = setup();
  await user.type(await editor(), '@ali');
  await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(2));

  await user.keyboard('{ArrowUp}');

  expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');
});

it('picks with the mouse', async () => {
  const { onSend, user } = setup();
  await user.type(await editor(), '@bo');
  await listbox();

  await user.click(screen.getByRole('option', { name: /Bob/ }));
  await user.keyboard('{Enter}');

  expect(onSend).toHaveBeenCalledWith({
    body: '@bob/example.test',
    mentions: [{ type: 'user', target: 'u2', token: '@bob/example.test' }],
  });
});

it('closes the suggestions on Escape and keeps the typed text', async () => {
  const { onSend, user } = setup();
  await user.type(await editor(), '@bo');
  await listbox();

  await user.keyboard('{Escape}');

  await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  await user.keyboard('{Enter}');
  expect(onSend).toHaveBeenCalledWith({ body: '@bo', mentions: [] });
});

it('serialises group, role and @all mentions to their tokens and sends the targets once each', async () => {
  const { onSend, user } = setup();
  const input = await editor();

  await user.type(input, '@des');
  await listbox();
  await user.keyboard('{Enter}');
  await user.type(input, '@moder');
  await user.keyboard('{Enter}');
  await user.type(input, '@every');
  await user.keyboard('{Enter}');
  await user.type(input, '@des');
  await user.keyboard('{Enter}');
  await user.keyboard('go{Enter}');

  expect(onSend).toHaveBeenCalledWith({
    body: '@design @moderator @all @design go',
    mentions: [
      { type: 'group', target: 'g1', token: '@design' },
      { type: 'role', target: 'moderator', token: '@moderator' },
      { type: 'all', target: null, token: '@all' },
    ],
  });
});

it('refetches the groups when the popup opens and they are older than the staleness window', async () => {
  const { fake, queryClient, user } = setup();
  await user.type(await editor(), 'x');
  await waitFor(() => expect(fake.stubs.groups.list).toHaveBeenCalledTimes(1));

  // Fresh: opening the popup does not ask again.
  await user.type(await editor(), ' @');
  await listbox();
  expect(fake.stubs.groups.list).toHaveBeenCalledTimes(1);
  await user.keyboard('{Escape}');

  queryClient.setQueryData(roomGroupsKey('r1'), { items: [] }, { updatedAt: Date.now() - 60_000 });
  await user.type(await editor(), ' @');

  await waitFor(() => expect(fake.stubs.groups.list).toHaveBeenCalledTimes(2));
});

it('announces the popup and the active option on the editor', async () => {
  const { user } = setup();
  const input = await editor();
  await user.type(input, '@bo');
  await listbox();

  await waitFor(() => expect(input).toHaveAttribute('aria-expanded', 'true'));
  expect(input).toHaveAttribute('aria-controls', 'mention-suggestions');
  const active = input.getAttribute('aria-activedescendant');
  expect(active).not.toBeNull();
  expect(document.getElementById(active ?? '')).toHaveAttribute('aria-selected', 'true');
});

it('shows a message when nothing matches', async () => {
  const { user } = setup();
  await user.type(await editor(), '@zzz');
  await listbox();

  expect(await screen.findByText('No match')).toBeInTheDocument();
});

it('calls onTyping when the draft changes, not when it is empty', async () => {
  const onTyping = vi.fn();
  const { user } = setup({ onTyping });
  await user.click(await editor());

  await user.keyboard('{Enter}');
  expect(onTyping).not.toHaveBeenCalled();

  await user.keyboard('h');
  expect(onTyping).toHaveBeenCalledTimes(1);

  await user.keyboard('i');
  expect(onTyping).toHaveBeenCalledTimes(2);
});
