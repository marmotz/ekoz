import type { AttachmentView, LinkPreviewView } from '@ekozhq/sdk';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';

import { MessageEditForm } from '@/features/chat/components/message-edit-form';
import type { TimelineMessage } from '@/features/chat/lib/timeline';
import { SdkProvider } from '@/shared/sdk/provider';
import { renderWithProviders } from '../../../../test/render';
import { createClientMock, createFakeSdk } from '../../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

const attachment: AttachmentView = {
  id: 'a1',
  filename: 'report.pdf',
  contentType: 'application/pdf',
  sizeBytes: '10240',
  width: null,
  height: null,
  durationMs: null,
  hasThumbnail: false,
};

const linkPreview: LinkPreviewView = {
  id: 'p1',
  url: 'https://example.test',
  title: 'Example site',
  description: 'A description',
  siteName: 'example.test',
  hasImage: false,
};

const message: TimelineMessage = {
  id: 'm1',
  roomId: 'r1',
  seq: '1',
  authorId: 'u1',
  body: 'hello',
  replyToId: null,
  mentions: [],
  mentionsMe: null,
  editedAt: null,
  redactedAt: null,
  hiddenAt: null,
  createdAt: '2026-01-01T10:00:00.000Z',
  reactions: [],
  attachments: [],
  linkPreview: null,
};

function setup(
  overrides: Partial<TimelineMessage> = {},
  props: Partial<{ canAttach: boolean }> = {},
  configure?: (fake: ReturnType<typeof createFakeSdk>) => void,
) {
  const fake = createFakeSdk({ identifier: 'jane/example.test', sessionId: 's1' });
  configure?.(fake);
  createClientMock.mockReturnValue(fake.sdk);

  const onFinished = vi.fn();
  const onDirtyChange = vi.fn();
  const { container } = renderWithProviders(
    <SdkProvider>
      <MessageEditForm
        message={{ ...message, ...overrides }}
        allowCollective
        canAttach={props.canAttach ?? false}
        onFinished={onFinished}
        onDirtyChange={onDirtyChange}
      />
    </SdkProvider>,
  );
  return { fake, onFinished, container, user: userEvent.setup() };
}

const editor = () => screen.findByRole('textbox', { name: 'Edit message' });

beforeEach(() => {
  createClientMock.mockReset();
});

it('toggles an existing attachment out of and back into the edit, then removes it on save', async () => {
  const { fake, user } = setup({ attachments: [attachment] });
  await editor();

  await user.click(screen.getByRole('button', { name: 'Remove report.pdf' }));
  expect(screen.getByText('report.pdf')).toHaveClass('line-through');

  await user.click(screen.getByRole('button', { name: 'Keep report.pdf' }));
  expect(screen.getByText('report.pdf')).not.toHaveClass('line-through');

  await user.click(screen.getByRole('button', { name: 'Remove report.pdf' }));
  await user.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() =>
    expect(fake.stubs.messages.edit).toHaveBeenCalledWith('r1', 'm1', {
      body: 'hello',
      mentions: [],
      attachments: { remove: ['a1'] },
    }),
  );
});

it('adds a new file through the tray and sends it on save', async () => {
  const { fake, container, user } = setup({}, { canAttach: true }, (f) => {
    f.stubs.uploads.upload.mockResolvedValue({
      id: 'up-1',
      promise: Promise.resolve({ id: 'up-1', state: 'ready' }),
    } as never);
  });
  await editor();

  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(['x'], 'notes.txt')] } });
  await screen.findByText('notes.txt');

  await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());
  await user.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() =>
    expect(fake.stubs.messages.edit).toHaveBeenCalledWith('r1', 'm1', {
      body: 'hello',
      mentions: [],
      attachments: { add: ['up-1'] },
    }),
  );
});

it('does not offer to attach new files without room.attach', async () => {
  setup({}, { canAttach: false });
  await editor();

  expect(screen.queryByRole('button', { name: 'Attach a file' })).not.toBeInTheDocument();
});

it('cancels without a request when nothing changed at all', async () => {
  const { fake, onFinished, user } = setup(
    { body: 'see https://example.test', linkPreview },
    {},
    (f) => {
      f.stubs.auth.policy.mockResolvedValue({
        registrationMode: 'open',
        emailVerificationRequired: true,
        passwordMinLength: 12,
        linkPreviews: true,
      } as never);
      f.stubs.linkPreviews.fetch.mockResolvedValue(linkPreview as never);
    },
  );
  await screen.findByText('Example site');

  await user.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(onFinished).toHaveBeenCalled());
  expect(fake.stubs.messages.edit).not.toHaveBeenCalled();
});

it('sends linkPreviewUrl: null once the preview is removed', async () => {
  const { fake, user } = setup({ body: 'see https://example.test', linkPreview }, {}, (f) => {
    f.stubs.auth.policy.mockResolvedValue({
      registrationMode: 'open',
      emailVerificationRequired: true,
      passwordMinLength: 12,
      linkPreviews: true,
    } as never);
    f.stubs.linkPreviews.fetch.mockResolvedValue(linkPreview as never);
  });
  await screen.findByText('Example site');

  await user.click(screen.getByRole('button', { name: 'Remove the link preview' }));
  await waitFor(() => expect(screen.queryByText('Example site')).not.toBeInTheDocument());

  await user.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() =>
    expect(fake.stubs.messages.edit).toHaveBeenCalledWith('r1', 'm1', {
      body: 'see https://example.test',
      mentions: [],
      linkPreviewUrl: null,
    }),
  );
});
