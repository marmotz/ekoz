import { screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { StorageSection } from '@/features/profile/components/storage-section';
import { renderSignedIn } from '../../../../test/render-signed-in';
import { createClientMock } from '../../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

beforeEach(() => {
  createClientMock.mockReset();
});

it('shows a usage bar against the quota', async () => {
  renderSignedIn(<StorageSection />, {
    configure: (fake) => {
      fake.stubs.me.storage.mockResolvedValue({
        usedBytes: String(512 * 1024 * 1024),
        pendingBytes: '0',
        quotaBytes: [String(1024 * 1024 * 1024)],
      } as never);
    },
  });

  expect(await screen.findByText('512.0 MB of 1.0 GB used')).toBeInTheDocument();
  const bar = await screen.findByRole('progressbar');
  expect(bar).toHaveAttribute('aria-valuenow', '50');
});

it('shows unlimited storage without a bar when there is no quota', async () => {
  renderSignedIn(<StorageSection />, {
    configure: (fake) => {
      fake.stubs.me.storage.mockResolvedValue({
        usedBytes: String(200 * 1024 * 1024),
        pendingBytes: '0',
        quotaBytes: [],
      } as never);
    },
  });

  expect(await screen.findByText('200.0 MB used - unlimited storage')).toBeInTheDocument();
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
});

it('shows an error when the usage cannot be loaded', async () => {
  renderSignedIn(<StorageSection />, {
    configure: (fake) => {
      fake.stubs.me.storage.mockRejectedValue(new Error('offline'));
    },
  });

  expect(await screen.findByText('Storage usage could not be loaded.')).toBeInTheDocument();
});

it('waits for the fetch before showing the bar', async () => {
  renderSignedIn(<StorageSection />, {
    configure: (fake) => {
      fake.stubs.me.storage.mockReturnValue(new Promise(() => {}));
    },
  });

  expect(await screen.findByLabelText('Loading storage usage')).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument());
});
