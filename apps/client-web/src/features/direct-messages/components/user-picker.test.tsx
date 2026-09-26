import { screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UserPicker } from '@/features/direct-messages/components/user-picker';
import type { PickerUser } from '@/features/direct-messages/hooks/use-contact-search';
import { type Configure, renderSignedIn } from '../../../../test/render-signed-in';
import { createClientMock } from '../../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

beforeEach(() => {
  createClientMock.mockReset();
});

const bob: PickerUser = {
  id: 'u2',
  identifier: 'bob/example.test',
  displayName: 'Bob',
  avatarUrl: null,
};
const carol: PickerUser = {
  id: 'u3',
  identifier: 'carol/example.test',
  displayName: 'Carol',
  avatarUrl: null,
};

function Harness({ excludeIds = [] as string[] }) {
  const [selected, setSelected] = useState<PickerUser[]>([]);

  return (
    <UserPicker selected={selected} onChange={setSelected} excludeIds={excludeIds} label="Search" />
  );
}

const withContacts =
  (...items: PickerUser[]): Configure =>
  ({ stubs }) => {
    stubs.conversations.searchContacts.mockResolvedValue({ items });
  };

describe('UserPicker', () => {
  it('asks for two characters before searching', async () => {
    const { fake, user } = renderSignedIn(<Harness />, { configure: withContacts(bob) });

    expect(await screen.findByText('Type at least 2 characters to search.')).toBeInTheDocument();
    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'b');

    expect(await screen.findByText('Type at least 2 characters to search.')).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(fake.stubs.conversations.searchContacts).not.toHaveBeenCalled();
  });

  it('searches the contacts from two characters, debounced', async () => {
    const { fake, user } = renderSignedIn(<Harness />, { configure: withContacts(bob, carol) });

    await user.type(await screen.findByRole('searchbox', { name: 'Search' }), 'bo');

    expect(await screen.findByRole('button', { name: 'Add Bob' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Carol' })).toBeInTheDocument();
    expect(fake.stubs.conversations.searchContacts).toHaveBeenCalledTimes(1);
    expect(fake.stubs.conversations.searchContacts).toHaveBeenCalledWith('bo');
    expect(fake.stubs.users.getProfile).not.toHaveBeenCalled();
  });

  it('looks an exact identifier up and lists it first', async () => {
    const { fake, user } = renderSignedIn(<Harness />, {
      configure: ({ stubs }) => {
        stubs.conversations.searchContacts.mockResolvedValue({ items: [carol] });
        stubs.users.getProfile.mockResolvedValue({
          id: 'u9',
          identifier: 'zed/example.test',
          displayName: 'Zed',
          bio: null,
          avatarUrl: null,
        });
      },
    });

    await user.type(await screen.findByRole('searchbox', { name: 'Search' }), 'zed/example.test');

    const buttons = await screen.findAllByRole('button', { name: /^Add / });
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Add Zed',
      'Add Carol',
    ]);
    expect(fake.stubs.users.getProfile).toHaveBeenCalledWith('zed/example.test');
  });

  it('never looks an email address up', async () => {
    const { fake, user } = renderSignedIn(<Harness />, { configure: withContacts() });

    await user.type(await screen.findByRole('searchbox', { name: 'Search' }), 'alice@example.test');

    expect(await screen.findByText('Nobody matches.')).toBeInTheDocument();
    expect(fake.stubs.users.getProfile).not.toHaveBeenCalled();
    expect(fake.stubs.conversations.searchContacts).toHaveBeenCalledWith('alice@example.test');
  });

  it('shows only the contact when the identifier lookup fails', async () => {
    const { user } = renderSignedIn(<Harness />, {
      configure: ({ stubs }) => {
        stubs.conversations.searchContacts.mockResolvedValue({ items: [bob] });
        stubs.users.getProfile.mockRejectedValue(new Error('not found'));
      },
    });

    await user.type(await screen.findByRole('searchbox', { name: 'Search' }), 'bob/example.test');

    expect(await screen.findByRole('button', { name: 'Add Bob' })).toBeInTheDocument();
  });

  it('turns picked people into removable chips and hides them from the results', async () => {
    const { user } = renderSignedIn(<Harness />, { configure: withContacts(bob, carol) });

    await user.type(await screen.findByRole('searchbox', { name: 'Search' }), 'o');
    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'b');
    await user.click(await screen.findByRole('button', { name: 'Add Bob' }));

    const chips = await screen.findByRole('list', { name: 'Selected people' });
    expect(chips).toHaveTextContent('Bob');
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('');

    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'bo');
    expect(await screen.findByRole('button', { name: 'Add Carol' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add Bob' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove Bob' }));
    await waitFor(() =>
      expect(screen.queryByRole('list', { name: 'Selected people' })).not.toBeInTheDocument(),
    );
  });

  it('leaves out the excluded people', async () => {
    const { user } = renderSignedIn(<Harness excludeIds={['u2']} />, {
      configure: withContacts(bob, carol),
    });

    await user.type(await screen.findByRole('searchbox', { name: 'Search' }), 'ca');

    expect(await screen.findByRole('button', { name: 'Add Carol' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add Bob' })).not.toBeInTheDocument();
  });
});
