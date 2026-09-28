import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { extractLinks } from '@/features/chat/lib/link-extraction';
import { useSdk } from '@/shared/sdk/use-sdk';

const DEBOUNCE_MS = 500;

/**
 * The composer's link preview: the first `http(s)` link of the body is fetched
 * (debounced), a "next link" cycles through the others, and dismissing clears
 * the choice for the rest of the draft (technical.md §6). Disabled entirely when
 * the `linkPreviews` auth policy is off.
 */
export function useLinkPreview(body: string, enabled: boolean) {
  const sdk = useSdk();
  const links = enabled ? extractLinks(body) : [];
  const linksKey = links.join('\n');

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const previousKey = useRef(linksKey);
  useEffect(() => {
    if (previousKey.current !== linksKey) {
      previousKey.current = linksKey;
      setSelectedIndex(0);
      setDismissed(false);
    }
  }, [linksKey]);

  const chosenUrl = dismissed ? null : (links[selectedIndex] ?? null);

  const [debouncedUrl, setDebouncedUrl] = useState<string | null>(null);
  useEffect(() => {
    // Cleared on the next tick (no debounce) so a dismiss or a body change without
    // a link stops the fetch at once, without setting state directly in the effect.
    const timer = setTimeout(
      () => setDebouncedUrl(chosenUrl),
      chosenUrl === null ? 0 : DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [chosenUrl]);

  const query = useQuery({
    queryKey: ['link-preview', debouncedUrl],
    queryFn: () => {
      if (!sdk || !debouncedUrl) throw new Error('Link preview not available');
      return sdk.linkPreviews.fetch(debouncedUrl);
    },
    enabled: sdk !== null && debouncedUrl !== null,
    staleTime: 5 * 60_000,
  });

  return {
    /** `null` while off, loading, dismissed or the server found no metadata. */
    preview: chosenUrl === debouncedUrl ? (query.data ?? null) : null,
    /** The links found in the body, in order; cycling wraps around. */
    links,
    chosenUrl,
    next: () => setSelectedIndex((index) => (index + 1) % Math.max(links.length, 1)),
    dismiss: () => setDismissed(true),
    /** Clears the choice, e.g. once the draft is sent. */
    reset: () => {
      setSelectedIndex(0);
      setDismissed(false);
    },
  };
}
