import { createRoute } from '@tanstack/react-router';
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RequireOwner } from '@/shared/sdk/require-owner';
import { renderRoute } from '../../../test/render';
import { createMockSdk } from '../../../test/sdk-mock';

function mountRequireOwner(sdk: ReturnType<typeof createMockSdk> | null) {
  const indexRoute = createRoute({
    component: () => (
      <RequireOwner>
        <div>protected content</div>
      </RequireOwner>
    ),
  } as any);

  return renderRoute({
    route: indexRoute,
    path: '/',
    initialPath: '/',
    sdk,
    extraPaths: ['/login'],
  });
}

describe('RequireOwner', () => {
  it('shows a skeleton while the session status is unknown', () => {
    mountRequireOwner(null);

    expect(screen.queryByText('protected content')).not.toBeInTheDocument();
  });

  it('redirects an anonymous session to /login', async () => {
    const sdk = createMockSdk();
    sdk.session.getState = () => undefined;

    const { router } = mountRequireOwner(sdk);

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });

  it('renders children once authenticated as an owner', async () => {
    const sdk = createMockSdk();
    sdk.session.getState = () => ({ identifier: 'alice', sessionId: 's1' });
    vi.mocked(sdk.me.get).mockResolvedValue({ isOwner: true } as never);

    mountRequireOwner(sdk);

    await waitFor(() => expect(screen.getByText('protected content')).toBeInTheDocument());
  });

  it('shows a not-owner screen for an authenticated non-owner', async () => {
    const sdk = createMockSdk();
    sdk.session.getState = () => ({ identifier: 'alice', sessionId: 's1' });
    vi.mocked(sdk.me.get).mockResolvedValue({ isOwner: false } as never);

    mountRequireOwner(sdk);

    await waitFor(() => expect(screen.getByText(/not an owner/i)).toBeInTheDocument());
    expect(screen.queryByText('protected content')).not.toBeInTheDocument();
  });
});
