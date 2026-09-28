import type { AttachmentView, FileRef } from '@ekozhq/sdk';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';

import { MessageAttachments } from '@/features/chat/components/message-attachments';
import {
  MessageActionsContext,
  type MessageActionsValue,
} from '@/features/chat/hooks/message-actions-context';
import { SdkProvider } from '@/shared/sdk/provider';
import { renderWithProviders } from '../../../../test/render';
import { createClientMock, createFakeSdk } from '../../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

const baseActions: MessageActionsValue = {
  roomId: 'r1',
  allowCollective: true,
  myId: 'me',
  capabilities: [],
  canPost: true,
  now: Date.now(),
  editWindow: null,
  pinnedIds: new Set(),
  editingId: null,
  onReply: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onPin: vi.fn(),
  onUnpin: vi.fn(),
  onToggleReaction: vi.fn(),
  onEditFinished: vi.fn(),
  onEditDirtyChange: vi.fn(),
  onJumpToMessage: vi.fn(),
};

function image(overrides: Partial<AttachmentView> = {}): AttachmentView {
  return {
    id: 'a1',
    filename: 'photo.png',
    contentType: 'image/png',
    sizeBytes: '2048',
    width: 800,
    height: 600,
    durationMs: null,
    hasThumbnail: true,
    ...overrides,
  };
}

function pdf(overrides: Partial<AttachmentView> = {}): AttachmentView {
  return {
    id: 'a2',
    filename: 'report.pdf',
    contentType: 'application/pdf',
    sizeBytes: '10240',
    width: null,
    height: null,
    durationMs: null,
    hasThumbnail: false,
    ...overrides,
  };
}

function audio(overrides: Partial<AttachmentView> = {}): AttachmentView {
  return {
    id: 'a3',
    filename: 'voice.mp3',
    contentType: 'audio/mpeg',
    sizeBytes: '4096',
    width: null,
    height: null,
    durationMs: 12_000,
    hasThumbnail: false,
    ...overrides,
  };
}

function setup(
  attachments: AttachmentView[],
  actions: MessageActionsValue | null = baseActions,
  authorId: string | null = 'me',
) {
  const fake = createFakeSdk({ identifier: 'jane/example.test', sessionId: 's1' });
  fake.stubs.files.urls.mockImplementation(async (refs: FileRef[]) => ({
    items: refs.map((ref) => ({
      ref,
      url: `https://files.test/${ref.kind === 'attachment' ? ref.id : ''}`,
      expiresAt: '2099-01-01T00:00:00.000Z',
    })),
  }));
  createClientMock.mockReturnValue(fake.sdk);

  renderWithProviders(
    <SdkProvider>
      <MessageActionsContext.Provider value={actions}>
        <MessageAttachments
          roomId="r1"
          messageId="m1"
          authorId={authorId}
          attachments={attachments}
        />
      </MessageActionsContext.Provider>
    </SdkProvider>,
  );

  return { fake, user: userEvent.setup() };
}

beforeEach(() => {
  createClientMock.mockReset();
});

it('renders nothing without attachments', () => {
  const { container } = renderWithProviders(
    <SdkProvider>
      <MessageAttachments roomId="r1" messageId="m1" authorId="me" attachments={[]} />
    </SdkProvider>,
  );

  expect(container).toBeEmptyDOMElement();
});

it('renders a file card with its name, formatted size and a download link', async () => {
  setup([pdf()]);

  expect(await screen.findByText('report.pdf')).toBeInTheDocument();
  expect(screen.getByText('10.0 KB')).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByRole('link', { name: 'Download report.pdf' })).toHaveAttribute(
      'href',
      'https://files.test/a2',
    ),
  );
});

it('renders an audio row with native controls', async () => {
  setup([audio()]);

  expect(await screen.findByText('voice.mp3')).toBeInTheDocument();
  await waitFor(() => {
    const audioEl = document.querySelector('audio');
    expect(audioEl).toHaveAttribute('src', 'https://files.test/a3');
  });
});

it('opens the lightbox with the original image on click', async () => {
  const { user } = setup([image()]);

  const tile = await screen.findByRole('button');
  await user.click(tile);

  await waitFor(() => {
    const img = screen.getAllByAltText('photo.png').find((el) => el.tagName === 'IMG');
    expect(img).toHaveAttribute('src', 'https://files.test/a1');
  });
});

it('hides the remove control without delete_own or delete_any', async () => {
  setup([pdf()], { ...baseActions, capabilities: [] });

  await screen.findByText('report.pdf');
  expect(screen.queryByRole('button', { name: 'Remove file' })).not.toBeInTheDocument();
});

it('shows the remove control for the author with delete_own', async () => {
  setup([pdf()], { ...baseActions, capabilities: ['room.delete_own'] }, 'me');

  expect(await screen.findByRole('button', { name: 'Remove file' })).toBeInTheDocument();
});

it('shows the remove control for a moderator with delete_any on someone else’s file', async () => {
  setup([pdf()], { ...baseActions, capabilities: ['room.delete_any'] }, 'other');

  expect(await screen.findByRole('button', { name: 'Remove file' })).toBeInTheDocument();
});

it('does not show the remove control for the author with only delete_any missing and not own', async () => {
  setup([pdf()], { ...baseActions, capabilities: ['room.delete_own'] }, 'other');

  await screen.findByText('report.pdf');
  expect(screen.queryByRole('button', { name: 'Remove file' })).not.toBeInTheDocument();
});

it('removes the attachment after confirmation', async () => {
  const { fake, user } = setup(
    [pdf()],
    { ...baseActions, capabilities: ['room.delete_own'] },
    'me',
  );

  await user.click(await screen.findByRole('button', { name: 'Remove file' }));
  await user.click(await screen.findByRole('button', { name: 'Remove' }));

  await waitFor(() =>
    expect(fake.stubs.messages.removeAttachment).toHaveBeenCalledWith('r1', 'm1', 'a2'),
  );
});
