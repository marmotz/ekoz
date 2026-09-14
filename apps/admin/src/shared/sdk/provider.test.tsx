import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SdkContext, SdkProvider } from '@/shared/sdk/provider';

function Probe() {
  return (
    <SdkContext.Consumer>{(sdk) => <div>{sdk ? 'client' : 'no client'}</div>}</SdkContext.Consumer>
  );
}

describe('SdkProvider', () => {
  it('creates the client only once mounted (client-only; nothing during SSR, where effects never run)', async () => {
    render(
      <SdkProvider>
        <Probe />
      </SdkProvider>,
    );

    await waitFor(() => expect(screen.getByText('client')).toBeInTheDocument());
  });
});
