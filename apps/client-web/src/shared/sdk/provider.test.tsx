import { act, render, screen, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';

import { SdkProvider } from '@/shared/sdk/provider';
import { useSdk } from '@/shared/sdk/use-sdk';
import { createClientMock, createFakeSdk } from '../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

function Probe() {
  const sdk = useSdk();
  return <p>{sdk ? 'ready' : 'no sdk'}</p>;
}

beforeEach(() => {
  createClientMock.mockReset();
  window.localStorage.clear();
});

it('creates no client and touches no storage when rendered on the server', () => {
  const getItem = vi.spyOn(window.localStorage, 'getItem');

  const html = renderToString(
    <SdkProvider>
      <Probe />
    </SdkProvider>,
  );

  expect(html).toContain('no sdk');
  expect(createClientMock).not.toHaveBeenCalled();
  expect(getItem).not.toHaveBeenCalled();
});

it('creates the client once mounted and publishes it after resume() settled', async () => {
  const fake = createFakeSdk();
  let finishResume: () => void = () => {};
  fake.stubs.session.resume.mockReturnValue(new Promise((resolve) => (finishResume = resolve)));
  createClientMock.mockReturnValue(fake.sdk);

  render(
    <SdkProvider>
      <Probe />
    </SdkProvider>,
  );

  expect(createClientMock).toHaveBeenCalledTimes(1);
  expect(createClientMock).toHaveBeenCalledWith(
    expect.objectContaining({ resolveApiUrl: expect.any(Function) }),
  );
  expect(fake.stubs.session.resume).toHaveBeenCalledTimes(1);
  expect(screen.getByText('no sdk')).toBeInTheDocument();

  await act(async () => finishResume());

  expect(await screen.findByText('ready')).toBeInTheDocument();
});

it('still publishes the client when resume() rejects', async () => {
  const fake = createFakeSdk();
  fake.stubs.session.resume.mockRejectedValue(new Error('store unreadable'));
  createClientMock.mockReturnValue(fake.sdk);

  render(
    <SdkProvider>
      <Probe />
    </SdkProvider>,
  );

  await waitFor(() => expect(screen.getByText('ready')).toBeInTheDocument());
});

it('creates a single client across a Strict Mode remount', async () => {
  const fake = createFakeSdk();
  createClientMock.mockReturnValue(fake.sdk);

  const { StrictMode } = await import('react');
  render(
    <StrictMode>
      <SdkProvider>
        <Probe />
      </SdkProvider>
    </StrictMode>,
  );

  expect(await screen.findByText('ready')).toBeInTheDocument();
  expect(createClientMock).toHaveBeenCalledTimes(1);
  expect(fake.stubs.session.resume).toHaveBeenCalledTimes(1);
});
