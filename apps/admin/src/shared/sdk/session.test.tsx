import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SdkContext } from '@/shared/sdk/provider';
import { useSession } from '@/shared/sdk/session';
import { createMockSdk } from '../../../test/sdk-mock';

describe('useSession', () => {
  it('is unknown before the SDK is provided', () => {
    const { result } = renderHook(() => useSession(), {
      wrapper: ({ children }) => <SdkContext.Provider value={null}>{children}</SdkContext.Provider>,
    });

    expect(result.current).toBe('unknown');
  });

  it('is anonymous once mounted with no existing session', () => {
    const sdk = createMockSdk();
    sdk.session.getState = () => undefined;

    const { result } = renderHook(() => useSession(), {
      wrapper: ({ children }) => <SdkContext.Provider value={sdk}>{children}</SdkContext.Provider>,
    });

    expect(result.current).toBe('anonymous');
  });

  it('is authenticated when a session already exists', () => {
    const sdk = createMockSdk();
    sdk.session.getState = () => ({ identifier: 'alice', sessionId: 's1' });

    const { result } = renderHook(() => useSession(), {
      wrapper: ({ children }) => <SdkContext.Provider value={sdk}>{children}</SdkContext.Provider>,
    });

    expect(result.current).toBe('authenticated');
  });

  it('transitions to anonymous on session:invalid', () => {
    const sdk = createMockSdk();
    sdk.session.getState = () => ({ identifier: 'alice', sessionId: 's1' });

    const { result } = renderHook(() => useSession(), {
      wrapper: ({ children }) => <SdkContext.Provider value={sdk}>{children}</SdkContext.Provider>,
    });

    expect(result.current).toBe('authenticated');

    act(() => {
      sdk.__emit('session:invalid', { reason: 'logout' });
    });

    expect(result.current).toBe('anonymous');
  });

  it('transitions to authenticated on session:authenticated', () => {
    const sdk = createMockSdk();
    sdk.session.getState = () => undefined;

    const { result } = renderHook(() => useSession(), {
      wrapper: ({ children }) => <SdkContext.Provider value={sdk}>{children}</SdkContext.Provider>,
    });

    expect(result.current).toBe('anonymous');

    act(() => {
      sdk.__emit('session:authenticated', { identifier: 'alice', sessionId: 's1' });
    });

    expect(result.current).toBe('authenticated');
  });
});
