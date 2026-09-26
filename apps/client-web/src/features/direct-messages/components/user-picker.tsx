import { X } from 'lucide-react';
import { useState } from 'react';

import {
  MIN_SEARCH_LENGTH,
  type PickerUser,
  useContactSearch,
} from '@/features/direct-messages/hooks/use-contact-search';
import { useDebouncedValue } from '@/features/direct-messages/lib/use-debounced-value';
import { useTranslation } from '@/shared/i18n/use-translation';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { UserAvatar } from '@/shared/ui/user-avatar';

/** Debounce of the search field, in milliseconds. */
export const PICKER_DEBOUNCE_MS = 250;

export interface UserPickerProps {
  selected: readonly PickerUser[];
  onChange: (selected: PickerUser[]) => void;
  /** People that cannot be picked (already members, the caller), by user id. */
  excludeIds?: readonly string[];
  /** Accessible name of the search field. */
  label: string;
}

const userName = (user: PickerUser, unknown: string) =>
  user.displayName ?? user.identifier ?? unknown;

/**
 * Search field, results and chips of the people picked (technical design 4.6). From two
 * characters it lists the contacts; a `name/server` identifier also looks the exact
 * profile up and lists it first. An email address is never looked up.
 */
export function UserPicker({ selected, onChange, excludeIds = [], label }: UserPickerProps) {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const term = useDebouncedValue(input.trim(), PICKER_DEBOUNCE_MS);
  const { results, active, ready } = useContactSearch(term);
  const taken = new Set([...excludeIds, ...selected.map((user) => user.id)]);
  const offered = results.filter((user) => !taken.has(user.id));
  const unknown = t('directMessages.picker.unknownUser');

  const pick = (user: PickerUser) => {
    onChange([...selected, user]);
    setInput('');
  };

  return (
    <div className="space-y-3">
      {selected.length > 0 && (
        <ul aria-label={t('directMessages.picker.selected')} className="flex flex-wrap gap-2">
          {selected.map((user) => (
            <li
              key={user.id}
              className="flex items-center gap-1 rounded-full bg-secondary py-0.5 pr-1 pl-2 text-sm"
            >
              <span>{userName(user, unknown)}</span>
              <button
                type="button"
                aria-label={t('directMessages.picker.remove', { name: userName(user, unknown) })}
                onClick={() => onChange(selected.filter((other) => other.id !== user.id))}
                className="rounded-full p-0.5 hover:bg-accent"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Input
        type="search"
        aria-label={label}
        placeholder={t('directMessages.picker.placeholder')}
        value={input}
        onChange={(event) => setInput(event.target.value)}
      />
      {!active ? (
        <p className="text-sm text-muted-foreground">
          {t('directMessages.picker.hint', { count: MIN_SEARCH_LENGTH })}
        </p>
      ) : !ready ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t('directMessages.picker.searching')}
        </p>
      ) : offered.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('directMessages.picker.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {offered.map((user) => (
            <li key={user.id}>
              <Button
                type="button"
                variant="ghost"
                className="h-auto w-full justify-start gap-2 py-1.5"
                aria-label={t('directMessages.picker.add', { name: userName(user, unknown) })}
                onClick={() => pick(user)}
              >
                <UserAvatar
                  userId={user.id}
                  identifier={user.identifier}
                  avatarUrl={user.avatarUrl}
                  displayName={user.displayName}
                  className="size-6"
                />
                <span className="truncate">{userName(user, unknown)}</span>
                {user.identifier && (
                  <span className="truncate text-xs text-muted-foreground">{user.identifier}</span>
                )}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
