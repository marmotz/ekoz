import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createSdkClient } from '@/shared/sdk/client';
import { createClientMock, createFakeSdk } from '../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

beforeEach(() => {
  createClientMock.mockReset();
  createClientMock.mockReturnValue(createFakeSdk().sdk);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

it('skips discovery in dev and targets the configured URL directly', async () => {
  vi.stubEnv('DEV', true);

  createSdkClient();

  const config = createClientMock.mock.calls[0]?.[0] as {
    server?: string;
    resolveApiUrl?: () => string;
    store: unknown;
  };
  expect(config.server).toBeUndefined();
  expect(config.resolveApiUrl?.()).toBe('http://localhost:3010');
  expect(config.store).toBeDefined();
});

it('resolves the server through discovery outside dev', () => {
  vi.stubEnv('DEV', false);

  createSdkClient();

  const config = createClientMock.mock.calls[0]?.[0] as {
    server?: string;
    resolveApiUrl?: unknown;
  };
  expect(config.server).toBe('http://localhost:3010');
  expect(config.resolveApiUrl).toBeUndefined();
});

it('fails loudly when the server is not configured', () => {
  vi.stubEnv('VITE_EKOZ_SERVER', '');

  expect(() => createSdkClient()).toThrow('VITE_EKOZ_SERVER is not set');
});
