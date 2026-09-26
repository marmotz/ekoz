import { useQuery } from '@tanstack/react-query';

import { conversationQueries } from '@/features/direct-messages/api/queries';
import { isIdentifierShape } from '@/features/direct-messages/lib/identifier';
import { useSdk } from '@/shared/sdk/use-sdk';

/** A person the picker can offer: the fields shown next to their name. */
export interface PickerUser {
  id: string;
  identifier: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

/** Shortest search the contacts endpoint accepts. */
export const MIN_SEARCH_LENGTH = 2;

/**
 * The people matching `term` (already debounced): the contacts from 2 characters on, and,
 * when `term` is a `name/server` identifier (never an email), the exact profile, listed
 * first. `ready` is true once nothing is left to load for this term.
 */
export function useContactSearch(term: string): {
  results: PickerUser[];
  active: boolean;
  ready: boolean;
} {
  const sdk = useSdk();
  const active = term.length >= MIN_SEARCH_LENGTH;
  const lookup = active && isIdentifierShape(term);

  const contactOptions = conversationQueries.contacts(sdk, term);
  const contacts = useQuery({ ...contactOptions, enabled: contactOptions.enabled && active });
  const profileOptions = conversationQueries.profile(sdk, term);
  const profile = useQuery({ ...profileOptions, enabled: profileOptions.enabled && lookup });

  const results: PickerUser[] = [];
  if (profile.data) {
    results.push({
      id: profile.data.id,
      identifier: profile.data.identifier,
      displayName: profile.data.displayName,
      avatarUrl: profile.data.avatarUrl,
    });
  }
  for (const contact of contacts.data?.items ?? []) {
    if (!results.some((result) => result.id === contact.id)) results.push(contact);
  }

  const ready = active && !contacts.isPending && (!lookup || !profile.isPending);
  return { results, active, ready };
}
