import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Editor } from '@tiptap/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { Composer } from '@/features/chat/components/composer';
import { SdkProvider } from '@/shared/sdk/provider';
import { renderWithProviders } from '../../../../test/render';
import { createClientMock, createFakeSdk } from '../../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);
vi.mock('@/shared/ui/popover', () => import('../../../../test/popover-mock'));
vi.mock('@/shared/ui/tooltip', () => import('../../../../test/tooltip-mock'));

function setup() {
  const fake = createFakeSdk({ identifier: 'jane/example.test', sessionId: 's1' });
  fake.stubs.rooms.members.mockResolvedValue({ items: [], nextCursor: null } as never);
  createClientMock.mockReturnValue(fake.sdk);

  const onSend = vi.fn();
  renderWithProviders(
    <SdkProvider>
      <Composer roomId="r1" allowCollective block={null} onSend={onSend} />
    </SdkProvider>,
  );
  return { onSend, user: userEvent.setup() };
}

const input = () => screen.findByRole('textbox', { name: 'Message' });
const tiptap = async () => ((await input()) as HTMLElement & { editor: Editor }).editor;
const linkButton = () => screen.getByRole('button', { name: 'Link' });
const textField = () => screen.getByLabelText('Text');
const urlField = () => screen.getByLabelText('URL');
const links = async () => [...(await input()).querySelectorAll('a')];

beforeEach(() => {
  createClientMock.mockReset();
});

/** Types `text` in the composer and selects `from`-`to`, then opens the popover. */
async function open(
  user: ReturnType<typeof userEvent.setup>,
  text: string,
  selection?: { from: number; to: number } | number,
) {
  await user.type(await input(), text);
  const editor = await tiptap();
  if (selection !== undefined) {
    editor.commands.setTextSelection(selection);
  }
  await user.click(linkButton());
}

it('links the selection, prefilled with its text', async () => {
  const { user } = setup();
  await open(user, 'read the docs', { from: 10, to: 14 });

  expect(textField()).toHaveValue('docs');
  expect(urlField()).toHaveValue('');
  await user.type(urlField(), 'https://example.test/docs');
  await user.click(screen.getByRole('button', { name: 'Apply' }));

  const [link] = await links();
  expect(link).toHaveTextContent('docs');
  expect(link).toHaveAttribute('href', 'https://example.test/docs');
  expect((await input()).textContent).toBe('read the docs');
  expect(screen.queryByLabelText('URL')).toBeNull();
});

it('adds https to an address typed without a scheme', async () => {
  const { user } = setup();
  await open(user, 'site', { from: 1, to: 5 });

  await user.type(urlField(), 'example.test');
  await user.click(screen.getByRole('button', { name: 'Apply' }));

  expect((await links())[0]).toHaveAttribute('href', 'https://example.test');
});

it('refuses another scheme with an inline error and stays open', async () => {
  const { user } = setup();
  await open(user, 'site', { from: 1, to: 5 });

  await user.type(urlField(), 'javascript:alert(1)');
  await user.click(screen.getByRole('button', { name: 'Apply' }));

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Enter a valid http, https or mailto link.',
  );
  expect(urlField()).toBeInTheDocument();
  expect(await links()).toHaveLength(0);

  await user.clear(urlField());
  await user.type(urlField(), 'https://example.test');
  expect(screen.queryByRole('alert')).toBeNull();
});

it('refuses an unparsable URL', async () => {
  const { user } = setup();
  await open(user, 'site', { from: 1, to: 5 });

  await user.type(urlField(), 'http://');
  await user.click(screen.getByRole('button', { name: 'Apply' }));

  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(await links()).toHaveLength(0);
});

it('inserts the text carrying the link when nothing is selected', async () => {
  const { user } = setup();
  await open(user, 'see ');

  expect(textField()).toHaveValue('');
  await user.type(textField(), 'the docs');
  await user.type(urlField(), 'https://example.test');
  await user.click(screen.getByRole('button', { name: 'Apply' }));

  const [link] = await links();
  expect(link).toHaveTextContent('the docs');
  expect((await input()).textContent).toBe('see the docs');
});

it('uses the URL as the text when the text is left empty', async () => {
  const { user } = setup();
  await open(user, 'see ');

  await user.type(urlField(), 'https://example.test');
  await user.click(screen.getByRole('button', { name: 'Apply' }));

  expect((await links())[0]).toHaveTextContent('https://example.test');
});

it('edits the whole link under the cursor', async () => {
  const { user } = setup();
  await user.type(await input(), 'go ');
  const editor = await tiptap();
  editor.commands.insertContent({
    type: 'text',
    text: 'old label',
    marks: [{ type: 'link', attrs: { href: 'https://old.test' } }],
  });
  editor.commands.setTextSelection(6);
  await user.click(linkButton());

  expect(textField()).toHaveValue('old label');
  expect(urlField()).toHaveValue('https://old.test');
  await user.clear(textField());
  await user.type(textField(), 'new label');
  await user.clear(urlField());
  await user.type(urlField(), 'https://new.test');
  await user.click(screen.getByRole('button', { name: 'Apply' }));

  const found = await links();
  expect(found).toHaveLength(1);
  expect(found[0]).toHaveTextContent('new label');
  expect(found[0]).toHaveAttribute('href', 'https://new.test');
  expect((await input()).textContent).toBe('go new label');
});

it('changes only the URL of a link and keeps its text', async () => {
  const { user } = setup();
  const editor = await tiptap();
  editor.commands.insertContent({
    type: 'text',
    text: 'label',
    marks: [{ type: 'link', attrs: { href: 'https://old.test' } }],
  });
  editor.commands.setTextSelection(3);
  await user.click(linkButton());

  await user.clear(urlField());
  await user.type(urlField(), 'https://new.test');
  await user.click(screen.getByRole('button', { name: 'Apply' }));

  expect((await links())[0]).toHaveAttribute('href', 'https://new.test');
  expect((await input()).textContent).toBe('label');
});

it('removes a link and keeps its text', async () => {
  const { user } = setup();
  const editor = await tiptap();
  editor.commands.insertContent({
    type: 'text',
    text: 'label',
    marks: [{ type: 'link', attrs: { href: 'https://old.test' } }],
  });
  editor.commands.setTextSelection(3);
  await user.click(linkButton());

  await user.click(screen.getByRole('button', { name: 'Remove link' }));

  expect(await links()).toHaveLength(0);
  expect((await input()).textContent).toBe('label');
});

it('offers no removal for a new link', async () => {
  const { user } = setup();
  await open(user, 'site', { from: 1, to: 5 });

  expect(screen.queryByRole('button', { name: 'Remove link' })).toBeNull();
});

it('opens with Ctrl+K from the editor', async () => {
  const { user } = setup();
  await user.type(await input(), 'site');

  await user.keyboard('{Control>}k{/Control}');

  expect(await screen.findByLabelText('URL')).toBeInTheDocument();
});

it('applies with Enter in a field, without sending the message', async () => {
  const { onSend, user } = setup();
  await open(user, 'site', { from: 1, to: 5 });

  await user.type(urlField(), 'https://example.test{Enter}');

  await waitFor(async () => expect(await links()).toHaveLength(1));
  expect(onSend).not.toHaveBeenCalled();
});

it('linkifies a bare URL typed in the message', async () => {
  const { user } = setup();

  await user.type(await input(), 'see https://example.test/page ');

  await waitFor(async () =>
    expect((await links())[0]).toHaveAttribute('href', 'https://example.test/page'),
  );
});
