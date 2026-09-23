import type { QueryClient } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';

import { SdkProvider } from '@/shared/sdk/provider';
import { renderWithProviders } from './render';
import { createClientMock, createFakeSdk } from './sdk-mock';

export type Fake = ReturnType<typeof createFakeSdk>;
export type Configure = (fake: Fake) => void;

/**
 * Mounts `ui` inside `SdkProvider` with a fake SDK that has a signed-in session.
 * `configure` adjusts the stubs before anything renders. Requires the calling file
 * to `vi.mock('@ekozhq/sdk', ...)` with `mockSdkModule`.
 */
export function renderSignedIn(
  ui: ReactElement,
  {
    configure,
    route,
    queryClient,
  }: { configure?: Configure; route?: string; queryClient?: QueryClient } = {},
) {
  const fake = createFakeSdk({ identifier: 'jane/example.test', sessionId: 's1' });
  configure?.(fake);
  createClientMock.mockReturnValue(fake.sdk);

  const rendered = renderWithProviders(<SdkProvider>{ui}</SdkProvider>, { route, queryClient });

  return { fake, ...rendered, user: userEvent.setup() };
}
