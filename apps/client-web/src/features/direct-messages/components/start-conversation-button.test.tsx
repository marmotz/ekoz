import { EkozError } from '@ekozhq/sdk';
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StartConversationButton } from '@/features/direct-messages/components/start-conversation-button';
import { renderSignedIn } from '../../../../test/render-signed-in';
import { createClientMock } from '../../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

beforeEach(() => {
  createClientMock.mockReset();
});

describe('StartConversationButton', () => {
  it('gets or creates the dm with the user, then opens it', async () => {
    const { fake, user, router } = renderSignedIn(<StartConversationButton userId="u2" />, {
      route: '/somewhere',
    });

    await user.click(await screen.findByRole('button', { name: 'Message' }));

    await waitFor(() => expect(fake.stubs.conversations.createDm).toHaveBeenCalledWith('u2'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/dms/dm-u2'));
  });

  it('shows why it failed and stays', async () => {
    const { user, router } = renderSignedIn(<StartConversationButton userId="u2" />, {
      route: '/somewhere',
      configure: ({ stubs }) =>
        stubs.conversations.createDm.mockRejectedValue(
          new EkozError({ code: 'room.user_not_found', status: 422 }),
        ),
    });

    await user.click(await screen.findByRole('button', { name: 'Message' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'One of these people does not exist or is not active.',
    );
    expect(router.state.location.pathname).toBe('/somewhere');
  });
});
