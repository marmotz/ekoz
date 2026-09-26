import EmojiPicker, { type EmojiClickData, EmojiStyle, Theme } from 'emoji-picker-react';
import type { EmojiData } from 'emoji-picker-react/dist/types/exposedTypes';
import { useEffect, useState } from 'react';

import { QUICK_REACTIONS } from '@/features/chat/lib/reaction-emojis';
import { useTranslation } from '@/shared/i18n/use-translation';

/** The picker's localised data, per active language; English is built in. */
const EMOJI_DATA: Record<string, () => Promise<{ default: EmojiData }>> = {
  fr: () => import('emoji-picker-react/dist/data/emojis-fr'),
};

export interface ReactionEmojiPickerProps {
  onPick: (emoji: string) => void;
}

/**
 * `emoji-picker-react` in reactions mode: the quick row, then "+" for the full picker
 * with search. Loaded lazily by `ReactionPicker`, so the chat bundle does not carry it.
 * Emojis are drawn natively (no third-party image host is contacted).
 */
export default function ReactionEmojiPicker({ onPick }: ReactionEmojiPickerProps) {
  const { i18n } = useTranslation();
  const language = i18n.language.split('-')[0] ?? 'en';
  const loadData = EMOJI_DATA[language];
  const [data, setData] = useState<EmojiData | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (loadData) {
      loadData()
        .then((module) => {
          if (!cancelled) setData(module.default);
        })
        .catch(() => {
          // Falls back to the built-in English data.
        });
    }
    return () => {
      cancelled = true;
    };
  }, [loadData]);

  // The app theme is a class on the root element (see the theme provider).
  const dark = document.documentElement.classList.contains('dark');
  const pick = ({ emoji }: EmojiClickData) => onPick(emoji);

  return (
    <EmojiPicker
      reactionsDefaultOpen
      allowExpandReactions
      reactions={[...QUICK_REACTIONS]}
      emojiStyle={EmojiStyle.NATIVE}
      theme={dark ? Theme.DARK : Theme.LIGHT}
      onReactionClick={pick}
      onEmojiClick={pick}
      lazyLoadEmojis
      {...(data ? { emojiData: data } : {})}
    />
  );
}
