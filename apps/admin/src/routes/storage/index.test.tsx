import type { AdminStorageDashboard } from '@ekozhq/sdk';
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Route as StorageDashboardRoute } from '@/routes/storage/index';
import { renderRoute } from '../../../test/render';
import { createMockSdk } from '../../../test/sdk-mock';

const dashboard: AdminStorageDashboard = {
  usedBytes: '1073741824',
  capacityBytes: '10737418240',
  blobCount: 42,
  pendingUploads: 2,
  topConsumers: [
    {
      user: { id: 'u1', identifier: 'alice', displayName: 'Alice', avatarUrl: null },
      usedBytes: '536870912',
    },
  ],
  driver: 'local',
  mediaTools: { available: false, ffmpegVersion: null },
};

function mount(sdk: ReturnType<typeof createMockSdk>) {
  return renderRoute({
    route: StorageDashboardRoute,
    path: '/storage/',
    initialPath: '/storage/',
    sdk,
    extraPaths: ['/users/$userId'],
  });
}

describe('/storage', () => {
  it('renders usage, capacity and top consumers', async () => {
    const sdk = createMockSdk();
    vi.mocked(sdk.admin.storage).mockResolvedValue(dashboard);

    mount(sdk);

    await waitFor(() => expect(screen.getByText('1 GB')).toBeInTheDocument());
    expect(screen.getByText('10 GB')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('shows the ffmpeg install hint when media tools are unavailable', async () => {
    const sdk = createMockSdk();
    vi.mocked(sdk.admin.storage).mockResolvedValue(dashboard);

    mount(sdk);

    await waitFor(() => expect(screen.getByText(/ffmpeg not found/i)).toBeInTheDocument());
    expect(screen.getByText(/install ffmpeg/i)).toBeInTheDocument();
  });

  it('shows unlimited when capacity is null', async () => {
    const sdk = createMockSdk();
    vi.mocked(sdk.admin.storage).mockResolvedValue({ ...dashboard, capacityBytes: null });

    mount(sdk);

    await waitFor(() => expect(screen.getByText('Unlimited')).toBeInTheDocument());
  });
});
