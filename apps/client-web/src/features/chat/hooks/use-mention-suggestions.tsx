import { useQueryClient } from '@tanstack/react-query';
import type { Editor } from '@tiptap/react';
import type {
  SuggestionKeyDownProps,
  SuggestionOptions,
  SuggestionProps,
} from '@tiptap/suggestion';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { MentionSuggestionList } from '@/features/chat/components/mention-suggestion-list';
import type { MentionRoleName } from '@/features/chat/lib/mention-node';
import {
  buildSuggestions,
  labelForMention,
  type MentionSuggestion,
  type SuggestionSources,
} from '@/features/chat/lib/mention-suggestions';
import { GROUPS_STALE_TIME, roomGroupsKey, useRoomGroups } from '@/shared/groups/room-groups';
import { useTranslation } from '@/shared/i18n/use-translation';
import { useRoomMembers } from '@/shared/members/room-members';

interface PopupState {
  items: MentionSuggestion[];
  selectedIndex: number;
  rect: DOMRect | null;
  command: (item: MentionSuggestion) => void;
}

export interface UseMentionSuggestionsOptions {
  roomId: string;
  /** `@all`, roles and groups: channels only. */
  allowCollective: boolean;
}

/**
 * The `@` suggestion of the composer (technical design C1). Returns the `suggestion`
 * options for `@tiptap/extension-mention` (stable, they read the latest members and
 * groups when the popup opens), the popup to render next to the editor, whether it is
 * open, and `labelFor` to name a target when a body is parsed back into nodes.
 */
export function useMentionSuggestions({ roomId, allowCollective }: UseMentionSuggestionsOptions) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const members = useRoomMembers(roomId);
  const groups = useRoomGroups(roomId);

  const sources: SuggestionSources = {
    members: members.data?.members ?? [],
    groups: groups.data?.items ?? [],
    allowCollective,
    roleLabel: (role) => t(`chat.mentions.roles.${role as MentionRoleName}`),
    allLabel: t('chat.mentions.all'),
  };

  const sourcesRef = useRef(sources);
  const roomIdRef = useRef(roomId);
  useEffect(() => {
    sourcesRef.current = sources;
    roomIdRef.current = roomId;
  });

  const [popup, setPopup] = useState<PopupState | null>(null);
  const popupRef = useRef<PopupState | null>(null);
  const update = useCallback((next: PopupState | null) => {
    popupRef.current = next;
    setPopup(next);
  }, []);

  const suggestion = useMemo(
    () =>
      ({
        char: '@',
        items: ({ query }: { query: string; editor: Editor }) =>
          buildSuggestions(query, sourcesRef.current),
        command: ({
          editor,
          range,
          props,
        }: {
          editor: Editor;
          range: { from: number; to: number };
          props: MentionSuggestion;
        }) => {
          const { mention } = props;
          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              {
                type: 'mention',
                attrs: {
                  type: mention.type,
                  target: mention.target,
                  token: mention.token,
                  label: mention.label,
                },
              },
              { type: 'text', text: ' ' },
            ])
            .run();
        },
        render: () => {
          const toState = (
            props: SuggestionProps<MentionSuggestion, MentionSuggestion>,
            selectedIndex: number,
          ): PopupState => ({
            items: props.items,
            selectedIndex: Math.min(selectedIndex, Math.max(props.items.length - 1, 0)),
            rect: props.clientRect?.() ?? null,
            command: props.command,
          });

          return {
            onStart: (props: SuggestionProps<MentionSuggestion, MentionSuggestion>) => {
              // Groups may have changed since the room was opened.
              const state = queryClient.getQueryState(roomGroupsKey(roomIdRef.current));
              if (!state || Date.now() - state.dataUpdatedAt > GROUPS_STALE_TIME) {
                void queryClient.invalidateQueries({ queryKey: roomGroupsKey(roomIdRef.current) });
              }
              update(toState(props, 0));
            },
            onUpdate: (props: SuggestionProps<MentionSuggestion, MentionSuggestion>) => {
              update(toState(props, 0));
            },
            onKeyDown: ({ event }: SuggestionKeyDownProps) => {
              const current = popupRef.current;
              if (!current) return false;
              const count = current.items.length;

              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                if (count === 0) return true;
                const step = event.key === 'ArrowDown' ? 1 : count - 1;
                update({ ...current, selectedIndex: (current.selectedIndex + step) % count });
                return true;
              }
              if (event.key === 'Enter' || event.key === 'Tab') {
                const item = current.items[current.selectedIndex];
                if (!item) return false;
                current.command(item);
                return true;
              }
              // Escape falls through: the plugin closes the popup itself.
              return false;
            },
            onExit: () => update(null),
          };
        },
      }) as unknown as Omit<SuggestionOptions, 'editor'>,
    // The callbacks read the latest values through refs, so the options stay stable.
    [queryClient, update],
  );

  const node: ReactNode = popup ? (
    <MentionSuggestionList
      items={popup.items}
      selectedIndex={popup.selectedIndex}
      rect={popup.rect}
      onSelect={popup.command}
    />
  ) : null;

  return {
    suggestion,
    popup: node,
    isOpen: popup !== null,
    activeOptionKey: popup?.items[popup.selectedIndex]?.key ?? null,
    labelFor: (mention: { type: string; target: string | null; token: string }) =>
      labelForMention(mention, sources),
  };
}
