import { screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { SidebarMentions } from '@/features/mentions/components/sidebar-mentions';
import { SdkProvider } from '@/shared/sdk/provider';
import { renderWithProviders } from '../../../../test/render';
import { renderSignedIn } from '../../../../test/render-signed-in';
import { createClientMock, createFakeSdk } from '../../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

beforeEach(() => {
  createClientMock.mockReset();
});

it('links to My mentions with the total of unread mentions over every room', async () => {
  renderSignedIn(<SidebarMentions />, {
    configure: ({ stubs }) =>
      stubs.mentions.unread.mockResolvedValue({
        items: [
          { roomId: 'r1', direct: 2, collective: 1 },
          { roomId: 'r2', direct: 0, collective: 4 },
        ],
      } as never),
  });

  const link = await screen.findByRole('link', { name: /My mentions/ });
  expect(link).toHaveAttribute('href', '/mentions');
  expect(await screen.findByRole('status', { name: '7 unread mentions' })).toHaveTextContent('7');
});

it('shows no badge without unread mentions', async () => {
  const { fake } = renderSignedIn(<SidebarMentions />);

  await screen.findByRole('link', { name: /My mentions/ });
  await vi.waitFor(() => expect(fake.stubs.mentions.unread).toHaveBeenCalled());
  expect(screen.queryByRole('status')).toBeNull();
});

it('renders nothing for an anonymous visitor', () => {
  createClientMock.mockReturnValue(createFakeSdk().sdk);

  renderWithProviders(
    <SdkProvider>
      <SidebarMentions />
    </SdkProvider>,
  );

  expect(screen.queryByRole('link', { name: /My mentions/ })).toBeNull();
});
