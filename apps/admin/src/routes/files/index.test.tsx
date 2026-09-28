import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Route as FilesRoute } from '@/routes/files/index';
import { renderRoute } from '../../../test/render';
import { createMockSdk } from '../../../test/sdk-mock';

const page = {
  items: [
    {
      id: 'a1',
      blobId: 'b1',
      refCount: 3,
      filename: 'report.pdf',
      contentType: 'application/pdf',
      sizeBytes: '2048',
      createdAt: '2026-01-01T00:00:00.000Z',
      room: { id: 'r1', name: 'general' },
      message: { id: 'm1' },
      uploader: { id: 'u1', identifier: 'alice', displayName: 'Alice', avatarUrl: null },
    },
  ],
  nextCursor: null,
};

function mount(sdk: ReturnType<typeof createMockSdk>) {
  return renderRoute({
    route: FilesRoute,
    path: '/files/',
    initialPath: '/files/',
    sdk,
    extraPaths: ['/users/$userId'],
  });
}

describe('/files', () => {
  it('renders search results', async () => {
    const sdk = createMockSdk();
    vi.mocked(sdk.admin.attachments.search).mockResolvedValue(page as never);

    mount(sdk);

    await waitFor(() => expect(screen.getByText('report.pdf')).toBeInTheDocument());
    expect(screen.getByText('2048 B')).toBeInTheDocument();
  });

  it('re-queries with the filename filter', async () => {
    const sdk = createMockSdk();
    vi.mocked(sdk.admin.attachments.search).mockResolvedValue({
      items: [],
      nextCursor: null,
    } as never);

    mount(sdk);

    const searchInput = await screen.findByPlaceholderText(/filename/i);
    await waitFor(() => expect(sdk.admin.attachments.search).toHaveBeenCalled());

    fireEvent.change(searchInput, { target: { value: 'report' } });

    await waitFor(() =>
      expect(sdk.admin.attachments.search).toHaveBeenLastCalledWith(
        expect.objectContaining({ q: 'report' }),
      ),
    );
  });

  it('opens a signed URL in a new tab', async () => {
    const sdk = createMockSdk();
    vi.mocked(sdk.admin.attachments.search).mockResolvedValue(page as never);
    vi.mocked(sdk.files.urls).mockResolvedValue({
      items: [
        {
          ref: { kind: 'attachment', id: 'a1', variant: 'original' },
          url: 'https://cdn/x',
          expiresAt: '2026-01-01T01:00:00.000Z',
        },
      ],
    });
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    mount(sdk);

    await waitFor(() => expect(screen.getByText('report.pdf')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /open/i }));

    await waitFor(() =>
      expect(openSpy).toHaveBeenCalledWith('https://cdn/x', '_blank', 'noopener,noreferrer'),
    );
    openSpy.mockRestore();
  });

  it('removes a blob everywhere after confirming, showing its reference count', async () => {
    const sdk = createMockSdk();
    vi.mocked(sdk.admin.attachments.search).mockResolvedValue(page as never);
    vi.mocked(sdk.admin.blobs.remove).mockResolvedValue(undefined);

    mount(sdk);

    await waitFor(() => expect(screen.getByText('report.pdf')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /remove everywhere/i }));

    await waitFor(() => expect(screen.getByText(/3 places/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    await waitFor(() => expect(sdk.admin.blobs.remove).toHaveBeenCalledWith('b1'));
  });
});
