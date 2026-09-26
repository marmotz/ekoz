import { screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { MessageBody } from '@/shared/messages/message-body';
import { renderSignedIn } from '../../../test/render-signed-in';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

const body = 'see [the docs](https://example.test/docs)\n\n```ts\nconst a = 1;\n```';

it('renders links as links and code blocks with their header by default', async () => {
  renderSignedIn(<MessageBody body={body} roomId="r1" />);

  expect(await screen.findByRole('link', { name: 'the docs' })).toHaveAttribute(
    'href',
    'https://example.test/docs',
  );
  expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
});

it('flattens links and code blocks to text in a compact rendering, clamped to two lines', async () => {
  renderSignedIn(<MessageBody body={body} roomId="r1" compact />);
  const text = await screen.findByText('the docs');

  expect(screen.queryByRole('link')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull();
  expect(text.closest('.line-clamp-2')).not.toBeNull();
});
