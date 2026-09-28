import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, it } from 'vitest';

import { useSendMessage } from '@/features/chat/hooks/use-send-message';
import { SdkContext } from '@/shared/sdk/use-sdk';
import { createFakeSdk } from '../../../../test/sdk-mock';

function setup() {
  const fake = createFakeSdk();
  const queryClient = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <SdkContext.Provider value={fake.sdk}>{children}</SdkContext.Provider>
    </QueryClientProvider>
  );

  return { fake, ...renderHook(() => useSendMessage('room-1'), { wrapper }) };
}

it('omits body from the SDK call for an attachment-only message', async () => {
  const { fake, result } = setup();

  await act(async () => {
    await result.current.send({
      body: '',
      mentions: [],
      attachments: [
        { uploadId: 'up-1', filename: 'cv.pdf', contentType: 'application/pdf', previewUrl: null },
      ],
    });
  });

  expect(fake.sdk.messages.send).toHaveBeenCalledWith('room-1', {
    attachments: ['up-1'],
  });
});

it('includes body when it is non-empty', async () => {
  const { fake, result } = setup();

  await act(async () => {
    await result.current.send({ body: 'hello', mentions: [], attachments: [] });
  });

  expect(fake.sdk.messages.send).toHaveBeenCalledWith('room-1', { body: 'hello' });
});
