import { screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { MembersToggle } from '@/features/members/components/members-toggle';
import {
  MEMBERS_PANEL_STORAGE_KEY,
  reloadMembersPanelPrefs,
} from '@/features/members/hooks/use-members-panel-prefs';
import { renderSignedIn } from '../../../../test/render-signed-in';
import { createClientMock } from '../../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

const member = (id: string, displayName: string | null) => ({
  role: 'member',
  joinedAt: '2026-01-01T00:00:00.000Z',
  user: { id, identifier: displayName ? `${id}/h.io` : null, displayName, avatarUrl: null },
});

function setup() {
  return renderSignedIn(<MembersToggle roomId="r1" />, {
    configure: (fake) => {
      fake.stubs.rooms.members.mockResolvedValue({
        items: [member('u1', 'Alice'), member('u2', 'Bob'), member('u3', null)],
        nextCursor: null,
      } as never);
    },
  });
}

beforeEach(() => {
  createClientMock.mockReset();
  window.localStorage.clear();
  reloadMembersPanelPrefs();
});

it('shows the number of members, deleted accounts left out', async () => {
  setup();

  const button = await screen.findByRole('button', { name: /Members/ });
  await waitFor(() => expect(button).toHaveTextContent('2'));
});

it('reflects and flips the open state', async () => {
  const { user } = setup();
  const button = await screen.findByRole('button', { name: /Members/ });
  expect(button).toHaveAttribute('aria-expanded', 'false');

  await user.click(button);

  expect(button).toHaveAttribute('aria-expanded', 'true');
  expect(JSON.parse(window.localStorage.getItem(MEMBERS_PANEL_STORAGE_KEY) ?? '')).toMatchObject({
    open: true,
  });

  await user.click(button);

  expect(button).toHaveAttribute('aria-expanded', 'false');
});

it('starts open when the preference says so', async () => {
  window.localStorage.setItem(
    MEMBERS_PANEL_STORAGE_KEY,
    JSON.stringify({ open: true, view: 'role' }),
  );
  reloadMembersPanelPrefs();

  setup();

  expect(await screen.findByRole('button', { name: /Members/ })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
});
