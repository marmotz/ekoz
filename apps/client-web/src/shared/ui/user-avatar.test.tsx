import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { UserAvatar } from '@/shared/ui/user-avatar';

const useAvatarSrc = vi.hoisted(() => vi.fn<() => string | null>());
vi.mock('@/shared/sdk/use-avatar-src', () => ({ useAvatarSrc }));

const props = { identifier: 'jane/example.test', avatarUrl: '/a?v=1', displayName: 'Jane Doe' };

it('shows the initials while the image is loading, on error and without avatar', () => {
  useAvatarSrc.mockReturnValue(null);

  render(<UserAvatar {...props} />);

  expect(screen.getByText('JD')).toBeInTheDocument();
});

it('shows a question mark when there is no name either', () => {
  useAvatarSrc.mockReturnValue(null);

  render(<UserAvatar {...props} displayName={undefined} />);

  expect(screen.getByText('?')).toBeInTheDocument();
});

it('asks for the avatar of the given identifier and version', () => {
  useAvatarSrc.mockReturnValue(null);

  render(<UserAvatar {...props} />);

  expect(useAvatarSrc).toHaveBeenCalledWith('jane/example.test', '/a?v=1');
});

it('keeps the initials until the image has loaded', () => {
  // jsdom never loads images: Radix keeps the fallback, which is the loading state.
  useAvatarSrc.mockReturnValue('blob:avatar-1');

  render(<UserAvatar {...props} />);

  expect(screen.getByText('JD')).toBeInTheDocument();
});
