import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Editor } from '@tiptap/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { Composer, type ComposerProps } from '@/features/chat/components/composer';
import { SdkProvider } from '@/shared/sdk/provider';
import { renderWithProviders } from '../../../../test/render';
import { createClientMock, createFakeSdk } from '../../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);
// The real popover takes tens of seconds to open under jsdom.
vi.mock('@/shared/ui/popover', () => import('../../../../test/popover-mock'));
vi.mock('@/shared/ui/tooltip', () => import('../../../../test/tooltip-mock'));

function setup(props: Partial<ComposerProps> = {}) {
  const fake = createFakeSdk({ identifier: 'jane/example.test', sessionId: 's1' });
  fake.stubs.rooms.members.mockResolvedValue({ items: [], nextCursor: null } as never);
  createClientMock.mockReturnValue(fake.sdk);

  const onSend = vi.fn();
  renderWithProviders(
    <SdkProvider>
      <Composer roomId="r1" allowCollective block={null} onSend={onSend} {...props} />
    </SdkProvider>,
  );
  return { fake, onSend, user: userEvent.setup() };
}

const input = () => screen.findByRole('textbox', { name: 'Message' });
/** TipTap keeps the editor on the DOM node of its view. */
const tiptap = async () => ((await input()) as HTMLElement & { editor: Editor }).editor;
const button = (name: string) => screen.getByRole('button', { name });

beforeEach(() => {
  createClientMock.mockReset();
});

it('offers one button per construct, plus link and help', async () => {
  setup();
  await input();

  for (const name of [
    'Bold',
    'Italic',
    'Strikethrough',
    'Inline code',
    'Code block',
    'Quote',
    'Bulleted list',
    'Numbered list',
    'Link',
    'Formatting help',
  ]) {
    expect(button(name)).toBeInTheDocument();
  }
});

it('formats the selection and shows the active state, without sending', async () => {
  const { onSend, user } = setup();
  await user.type(await input(), 'hello');
  const editor = await tiptap();
  editor.commands.setTextSelection({ from: 1, to: 6 });

  await user.click(button('Bold'));

  expect((await input()).querySelector('strong')).toHaveTextContent('hello');
  expect(button('Bold')).toHaveAttribute('aria-pressed', 'true');
  expect(button('Italic')).toHaveAttribute('aria-pressed', 'false');
  expect(onSend).not.toHaveBeenCalled();

  await user.click(button('Bold'));

  expect(button('Bold')).toHaveAttribute('aria-pressed', 'false');
  expect((await input()).querySelector('strong')).toBeNull();
});

it('keeps the caret in the editor when a button is clicked', async () => {
  const { user } = setup();
  await user.type(await input(), 'hello');

  await user.click(button('Quote'));

  expect((await input()).querySelector('blockquote')).not.toBeNull();
  expect(await input()).toHaveFocus();
});

it('turns the buttons off when writing is not possible', async () => {
  setup({ block: 'read_only' });
  await input();

  expect(button('Bold')).toBeDisabled();
  expect(button('Link')).toBeDisabled();
});

it('shows the shortcut in a tooltip', async () => {
  const { user } = setup();
  await input();

  await user.hover(button('Bold'));

  expect(await screen.findByRole('tooltip')).toHaveTextContent('Ctrl+B');
});

it('describes the shortcuts and the Markdown syntax in the help panel', async () => {
  const { user } = setup();
  await input();

  await user.click(button('Formatting help'));

  const dialog = await screen.findByRole('dialog', { name: 'Formatting help' });
  expect(within(dialog).getByText('Ctrl+Shift+S')).toBeInTheDocument();
  expect(within(dialog).getByText('Ctrl+K')).toBeInTheDocument();
  expect(within(dialog).getByText('Enter')).toBeInTheDocument();
  expect(within(dialog).getByText('Shift+Enter')).toBeInTheDocument();
  expect(within(dialog).getByText('**text**')).toBeInTheDocument();
});

it('folds the toolbar behind the "Aa" button below md', async () => {
  const { user } = setup();
  await input();
  const toggle = button('Formatting options');
  const toolbar = screen.getByRole('toolbar', { name: 'Formatting' });

  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(toolbar).toHaveClass('hidden', 'md:flex');

  await user.click(toggle);

  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(toolbar).toHaveClass('flex');
  expect(toolbar).not.toHaveClass('hidden');
});

it('shows the language selector only inside a code block and changes what is sent', async () => {
  const { onSend, user } = setup();
  await user.type(await input(), 'const a = 1;');
  expect(screen.queryByRole('combobox', { name: 'Code language' })).toBeNull();

  await user.click(button('Code block'));

  const select = await screen.findByRole('combobox', { name: 'Code language' });
  expect(select).toHaveValue('');
  expect(within(select).getByRole('option', { name: 'Auto-detect' })).toBeInTheDocument();
  expect(within(select).getByRole('option', { name: 'Plain text' })).toBeInTheDocument();

  await user.selectOptions(select, 'TypeScript');
  await waitFor(async () => expect(await input()).toHaveFocus());
  await user.keyboard('{Enter}');

  expect(onSend).toHaveBeenCalledWith({ body: '```typescript\nconst a = 1;\n```', mentions: [] });
});

it('sends a bare fence for auto-detect', async () => {
  const { onSend, user } = setup();
  await user.type(await input(), 'x');
  await user.click(button('Code block'));
  await user.keyboard('{Enter}');

  expect(onSend).toHaveBeenCalledWith({ body: '```\nx\n```', mentions: [] });
});

it('sends ```text for plain text', async () => {
  const { onSend, user } = setup();
  await user.type(await input(), 'y');
  await user.click(button('Code block'));
  await user.selectOptions(
    await screen.findByRole('combobox', { name: 'Code language' }),
    'Plain text',
  );
  await waitFor(async () => expect(await input()).toHaveFocus());
  await user.keyboard('{Enter}');

  expect(onSend).toHaveBeenCalledWith({ body: '```text\ny\n```', mentions: [] });
});

it('sends on Enter inside a list and a code block, and breaks the line with Shift+Enter', async () => {
  const { onSend, user } = setup();
  await user.type(await input(), 'one');
  await user.click(button('Bulleted list'));
  await user.keyboard('{Shift>}{Enter}{/Shift}two');

  await user.keyboard('{Enter}');

  expect(onSend).toHaveBeenCalledWith({ body: '- one\n- two', mentions: [] });
});

it('cannot exceed the Markdown the server accepts: a heading typed stays text', async () => {
  const { onSend, user } = setup();

  await user.type(await input(), '# not a title{Enter}');

  expect(onSend).toHaveBeenCalledTimes(1);
  expect((await input()).querySelector('h1')).toBeNull();
  await waitFor(() => expect(onSend.mock.calls[0]?.[0].body).toContain('# not a title'));
});

it('sends several messages in a row', async () => {
  const { onSend, user } = setup();

  await user.type(await input(), 'one{Enter}');
  await user.type(await input(), 'two{Enter}');

  expect(onSend.mock.calls.map(([message]) => message.body)).toEqual(['one', 'two']);
});

it('sends a code block, then a message', async () => {
  const { onSend, user } = setup();
  await user.type(await input(), 'x');
  await user.click(button('Code block'));
  await user.keyboard('{Enter}');

  await user.type(await input(), 'after{Enter}');

  expect(onSend.mock.calls.map(([message]) => message.body)).toEqual(['```\nx\n```', 'after']);
});
