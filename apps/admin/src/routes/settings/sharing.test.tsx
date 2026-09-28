import type { ConfigParameterView } from '@ekozhq/sdk';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Route as SharingSettingsRoute } from '@/routes/settings/sharing';
import { renderRoute } from '../../../test/render';
import { createMockSdk } from '../../../test/sdk-mock';

type ParamFixture = Omit<ConfigParameterView, 'value'> & { value: unknown };

function param(overrides: Partial<ParamFixture>): ConfigParameterView {
  return {
    key: 'attachments.max_per_message',
    kind: 'runtime',
    value: 10,
    source: 'default',
    locked: false,
    hotReloadable: true,
    secret: false,
    schemaHint: null,
    ...overrides,
  } as unknown as ConfigParameterView;
}

const baseParams: ConfigParameterView[] = [
  param({ key: 'uploads.max_file_bytes', value: 26_214_400 }),
  param({ key: 'uploads.default_quota_bytes', value: 1_073_741_824 }),
  param({ key: 'uploads.pending_ttl', value: '24h' }),
  param({ key: 'uploads.filter_mode', value: 'blocklist' }),
  param({ key: 'uploads.filter_types', value: [] }),
  param({ key: 'attachments.max_per_message', value: 10 }),
  param({ key: 'storage.capacity_bytes', value: null }),
  param({ key: 'link_previews.enabled', value: false }),
  param({ key: 'link_previews.cache_ttl', value: '24h' }),
  param({ key: 'link_previews.throttle', value: { window: '1m', max: 10 } }),
  param({ key: 'files.url_ttl', value: '1h', source: 'settings' }),
];

function mount(sdk: ReturnType<typeof createMockSdk>) {
  return renderRoute({
    route: SharingSettingsRoute,
    path: '/settings/sharing',
    initialPath: '/settings/sharing',
    sdk,
  });
}

describe('/settings/sharing', () => {
  it('renders every field with its resolved value and source', async () => {
    const sdk = createMockSdk();
    vi.mocked(sdk.admin.settings.list).mockResolvedValue(baseParams);

    mount(sdk);

    await waitFor(() => expect(screen.getByDisplayValue('10')).toBeInTheDocument());
    expect(screen.getAllByText('Overridden')).toHaveLength(1);
    expect(screen.getAllByText('Default').length).toBeGreaterThan(0);
  });

  it('saves an edited int field', async () => {
    const sdk = createMockSdk();
    vi.mocked(sdk.admin.settings.list).mockResolvedValue(baseParams);
    vi.mocked(sdk.admin.settings.set).mockResolvedValue(
      param({ key: 'attachments.max_per_message', value: 20 }),
    );

    mount(sdk);

    const input = await screen.findByDisplayValue('10');
    fireEvent.change(input, { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() =>
      expect(sdk.admin.settings.set).toHaveBeenCalledWith('attachments.max_per_message', 20),
    );
  });

  it('resets an overridden field to default', async () => {
    const sdk = createMockSdk();
    vi.mocked(sdk.admin.settings.list).mockResolvedValue(baseParams);
    vi.mocked(sdk.admin.settings.reset).mockResolvedValue(undefined);

    mount(sdk);

    await waitFor(() => expect(screen.getByText('Overridden')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /reset to default/i }));

    await waitFor(() => expect(sdk.admin.settings.reset).toHaveBeenCalledWith('files.url_ttl'));
  });

  it('disables editing and hides reset for a locked (env-sourced) field', async () => {
    const sdk = createMockSdk();
    vi.mocked(sdk.admin.settings.list).mockResolvedValue(
      baseParams.map((p) =>
        p.key === 'attachments.max_per_message' ? { ...p, locked: true, source: 'env' } : p,
      ),
    );

    mount(sdk);

    const input = await screen.findByDisplayValue('10');
    expect(input).toBeDisabled();
    // Only `files.url_ttl` (source: settings) offers reset; the now-locked field does not.
    expect(screen.getAllByRole('button', { name: /reset to default/i })).toHaveLength(1);
  });
});
