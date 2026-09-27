import type { RoomFileItem } from '@ekozhq/sdk';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';

import { FilesPanel } from '@/features/chat/components/files-panel';
import { SdkProvider } from '@/shared/sdk/provider';
import { renderWithProviders } from '../../../../test/render';
import { createClientMock, createFakeSdk } from '../../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

beforeEach(() => {
  createClientMock.mockReset();
});

function file(overrides: Partial<RoomFileItem> = {}): RoomFileItem {
  return {
    id: 'a1',
    filename: 'report.pdf',
    contentType: 'application/pdf',
    sizeBytes: '10240',
    width: null,
    height: null,
    durationMs: null,
    hasThumbnail: false,
    messageId: 'm1',
    uploaderId: 'u1',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function setup(configure?: (fake: ReturnType<typeof createFakeSdk>) => void) {
  const fake = createFakeSdk({ identifier: 'jane/example.test', sessionId: 's1' });
  configure?.(fake);
  createClientMock.mockReturnValue(fake.sdk);

  const onSelect = vi.fn();
  const onOpenChange = vi.fn();
  renderWithProviders(
    <SdkProvider>
      <FilesPanel roomId="r1" open onOpenChange={onOpenChange} onSelect={onSelect} />
    </SdkProvider>,
  );
  return { fake, onSelect, onOpenChange, user: userEvent.setup() };
}

it('shows the empty state for both tabs', async () => {
  const { user } = setup((fake) => {
    fake.stubs.files.roomFiles.mockResolvedValue({ items: [], nextCursor: null } as never);
  });

  expect(await screen.findByText('No media shared yet.')).toBeInTheDocument();

  await user.click(screen.getByRole('tab', { name: 'Documents' }));
  expect(await screen.findByText('No documents shared yet.')).toBeInTheDocument();
});

it('lists documents and jumps to the message on click', async () => {
  const { onSelect, onOpenChange, user } = setup((fake) => {
    fake.stubs.files.roomFiles.mockImplementation(async (_roomId, params) => {
      if (params?.kind === 'documents') {
        return { items: [file()], nextCursor: null };
      }
      return { items: [], nextCursor: null };
    });
  });

  await user.click(await screen.findByRole('tab', { name: 'Documents' }));
  await user.click(await screen.findByText('report.pdf'));

  expect(onOpenChange).toHaveBeenCalledWith(false);
  expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1', messageId: 'm1' }));
});

it('loads the next page from the button', async () => {
  const { fake, user } = setup((fakeSdk) => {
    fakeSdk.stubs.files.roomFiles.mockImplementation(async (_roomId, params) => {
      if (params?.kind !== 'documents') return { items: [], nextCursor: null };
      if (!params.before) {
        return { items: [file({ id: 'a1' })], nextCursor: 'a1' };
      }
      return { items: [file({ id: 'a2', filename: 'notes.txt' })], nextCursor: null };
    });
  });

  await user.click(await screen.findByRole('tab', { name: 'Documents' }));
  await screen.findByText('report.pdf');

  await user.click(screen.getByRole('button', { name: 'Load more' }));

  await waitFor(() => expect(screen.getByText('notes.txt')).toBeInTheDocument());
  expect(fake.stubs.files.roomFiles).toHaveBeenCalledWith('r1', {
    kind: 'documents',
    limit: 30,
    before: 'a1',
  });
});
