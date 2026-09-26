import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';

import { ReactionPicker } from '@/features/chat/components/reaction-picker';
import { QUICK_REACTIONS } from '@/features/chat/lib/reaction-emojis';
import { renderWithProviders } from '../../../../test/render';

vi.mock('@/shared/ui/popover', () => import('../../../../test/popover-mock'));

const picker = vi.hoisted(() => vi.fn());
vi.mock('emoji-picker-react', () => ({
  default: (props: Record<string, unknown>) => {
    picker(props);
    return (
      <button
        type="button"
        onClick={() =>
          (props.onReactionClick as (data: { emoji: string }) => void)({ emoji: '🎉' })
        }
      >
        pick
      </button>
    );
  },
  EmojiStyle: { NATIVE: 'native' },
  Theme: { DARK: 'dark', LIGHT: 'light' },
}));
vi.mock('emoji-picker-react/dist/data/emojis-fr', () => ({
  default: { emojis: {}, categories: {} },
}));

beforeEach(() => {
  picker.mockClear();
  document.documentElement.classList.remove('dark');
  window.localStorage.clear();
});

function renderPicker(props: { open?: boolean; language?: string } = {}) {
  const onPick = vi.fn();
  const onOpenChange = vi.fn();
  const rendered = renderWithProviders(
    <ReactionPicker open={props.open ?? true} onOpenChange={onOpenChange} onPick={onPick} />,
    props.language ? { language: props.language } : {},
  );
  return { onPick, onOpenChange, ...rendered, user: userEvent.setup() };
}

it('renders nothing, and does not load the emoji picker, while closed', () => {
  renderPicker({ open: false });

  expect(screen.queryByRole('button', { name: 'pick' })).toBeNull();
  expect(picker).not.toHaveBeenCalled();
});

it('shows the picker in reactions mode with the quick row, native emojis and the light theme', async () => {
  renderPicker();

  await screen.findByRole('button', { name: 'pick' });

  expect(picker).toHaveBeenLastCalledWith(
    expect.objectContaining({
      reactionsDefaultOpen: true,
      allowExpandReactions: true,
      reactions: [...QUICK_REACTIONS],
      emojiStyle: 'native',
      theme: 'light',
    }),
  );
});

it('follows the dark theme of the app', async () => {
  window.localStorage.setItem('ekoz.theme', 'dark');
  renderPicker();

  await waitFor(() =>
    expect(picker).toHaveBeenLastCalledWith(expect.objectContaining({ theme: 'dark' })),
  );
});

it('reports the emoji character and closes', async () => {
  const { user, onPick, onOpenChange } = renderPicker();

  await user.click(await screen.findByRole('button', { name: 'pick' }));

  expect(onPick).toHaveBeenCalledWith('🎉');
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

it('uses the localised emoji data of the active language, and the built-in English one otherwise', async () => {
  renderPicker({ language: 'fr' });

  await waitFor(() =>
    expect(picker).toHaveBeenLastCalledWith(
      expect.objectContaining({ emojiData: { emojis: {}, categories: {} } }),
    ),
  );
});

it('keeps the built-in data for English', async () => {
  renderPicker({ language: 'en' });

  await screen.findByRole('button', { name: 'pick' });

  expect(picker.mock.calls.at(-1)?.[0]).not.toHaveProperty('emojiData');
});
