import type { LinkPreviewView } from '@ekozhq/sdk';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';

import { MessageLinkPreview } from '@/features/chat/components/message-link-preview';
import { SdkProvider } from '@/shared/sdk/provider';
import { renderWithProviders } from '../../../../test/render';
import { createClientMock, createFakeSdk } from '../../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

beforeEach(() => {
  createClientMock.mockReset();
});

const linkPreview: LinkPreviewView = {
  id: 'p1',
  url: 'https://example.test',
  title: 'Example site',
  description: 'A description',
  siteName: 'example.test',
  hasImage: false,
};

function setup(authorId: string | null, myId: string | null) {
  const fake = createFakeSdk({ identifier: 'jane/example.test', sessionId: 's1' });
  createClientMock.mockReturnValue(fake.sdk);

  renderWithProviders(
    <SdkProvider>
      <MessageLinkPreview
        roomId="r1"
        messageId="m1"
        authorId={authorId}
        linkPreview={linkPreview}
        myId={myId}
      />
    </SdkProvider>,
  );
  return { fake, user: userEvent.setup() };
}

it('renders the preview', async () => {
  setup('u1', 'u1');

  expect(await screen.findByText('Example site')).toBeInTheDocument();
});

it('shows the remove button for the author', async () => {
  setup('u1', 'u1');

  expect(
    await screen.findByRole('button', { name: 'Remove the link preview' }),
  ).toBeInTheDocument();
});

it('hides the remove button for someone other than the author', async () => {
  setup('u1', 'u2');

  await screen.findByText('Example site');
  expect(screen.queryByRole('button', { name: 'Remove the link preview' })).not.toBeInTheDocument();
});

it('edits the message with a null linkPreviewUrl on remove', async () => {
  const { fake, user } = setup('u1', 'u1');

  await user.click(await screen.findByRole('button', { name: 'Remove the link preview' }));

  await waitFor(() =>
    expect(fake.stubs.messages.edit).toHaveBeenCalledWith('r1', 'm1', { linkPreviewUrl: null }),
  );
});
