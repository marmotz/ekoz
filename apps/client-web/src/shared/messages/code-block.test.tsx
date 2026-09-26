import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import Markdown from 'react-markdown';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createI18n } from '@/app/i18n';
import { markdownOptions } from '@/shared/messages/markdown-allow-list';

const writeText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  writeText.mockClear();
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
});

afterEach(() => {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
});

const renderBlock = (source: string) =>
  render(
    <I18nextProvider i18n={createI18n('en')}>
      <Markdown {...markdownOptions}>{source}</Markdown>
    </I18nextProvider>,
  );

it('labels a block with its declared language, through the table', () => {
  renderBlock('```ts\nconst a = 1;\n```');

  expect(screen.getByTestId('code-block')).toHaveTextContent('TypeScript');
});

it('labels an alias with the language it stands for', () => {
  renderBlock('```py\nprint(1)\n```');

  expect(screen.getByTestId('code-block')).toHaveTextContent('Python');
});

it('labels a detected language', () => {
  renderBlock('```\n{"a": [1, 2, 3], "b": {"c": null}}\n```');

  expect(screen.getByTestId('code-block')).toHaveTextContent('JSON');
});

it('labels plain text, and shows no label for an unknown language', () => {
  const { unmount } = renderBlock('```text\nhello\n```');
  expect(screen.getByTestId('code-block')).toHaveTextContent('Plain text');
  unmount();

  renderBlock('```klingon\nhello\n```');
  expect(screen.getByTestId('code-block')).not.toHaveTextContent('klingon');
});

it('copies the text of the block and confirms it', async () => {
  const user = userEvent.setup();
  // `setup()` installs its own clipboard stub: put ours back to observe the call.
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  renderBlock('```ts\nconst a = 1;\nconst b = 2;\n```');

  await user.click(await screen.findByRole('button', { name: 'Copy' }));

  expect(writeText).toHaveBeenCalledWith('const a = 1;\nconst b = 2;\n');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument());
});

it('hides the copy button without the clipboard API', () => {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
  renderBlock('```ts\nconst a = 1;\n```');

  expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull();
});
