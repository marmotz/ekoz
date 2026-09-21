import type { EkozClient } from '@ekozhq/sdk';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useConfirmPasswordReset } from '@/features/auth/api/use-confirm-password-reset';
import { useLogin } from '@/features/auth/api/use-login';
import { useRegister } from '@/features/auth/api/use-register';
import { useRequestPasswordReset } from '@/features/auth/api/use-request-password-reset';
import { useResendVerification } from '@/features/auth/api/use-resend-verification';
import { useVerifyEmail } from '@/features/auth/api/use-verify-email';
import { SdkContext } from '@/shared/sdk/use-sdk';

function wrapper(sdk: EkozClient | null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <SdkContext.Provider value={sdk}>{children}</SdkContext.Provider>
    </QueryClientProvider>
  );
}

const CASES = [
  ['useLogin', useLogin, 'login', { identifier: 'jane', password: 'pw' }],
  [
    'useRegister',
    useRegister,
    'register',
    { name: 'jane', email: 'j@example.com', displayName: 'Jane', password: 'pw' },
  ],
  ['useVerifyEmail', useVerifyEmail, 'verifyEmail', { token: 't' }],
  [
    'useResendVerification',
    useResendVerification,
    'resendVerification',
    { email: 'j@example.com' },
  ],
  [
    'useRequestPasswordReset',
    useRequestPasswordReset,
    'requestPasswordReset',
    { email: 'j@example.com' },
  ],
  [
    'useConfirmPasswordReset',
    useConfirmPasswordReset,
    'confirmPasswordReset',
    { token: 't', newPassword: 'pw' },
  ],
] as const;

describe.each(CASES)('%s', (_name, useMutationHook, method, body) => {
  it(`calls auth.${method} once with the body`, async () => {
    const call = vi.fn(async () => ({ ok: true }));
    const sdk = { auth: { [method]: call } } as unknown as EkozClient;

    const { result } = renderHook(() => useMutationHook(), { wrapper: wrapper(sdk) });
    await act(async () => {
      await result.current.mutateAsync(body as never);
    });

    expect(call).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledWith(body);
  });

  it('surfaces the SDK error', async () => {
    const failure = new Error('nope');
    const sdk = {
      auth: {
        [method]: vi.fn(async () => {
          throw failure;
        }),
      },
    } as unknown as EkozClient;

    const { result } = renderHook(() => useMutationHook(), { wrapper: wrapper(sdk) });
    act(() => result.current.mutate(body as never));

    await waitFor(() => expect(result.current.error).toBe(failure));
  });

  it('fails instead of calling anything before the SDK is ready', async () => {
    const { result } = renderHook(() => useMutationHook(), { wrapper: wrapper(null) });
    act(() => result.current.mutate(body as never));

    await waitFor(() => expect(result.current.error).toEqual(new Error('SDK not started')));
  });
});
