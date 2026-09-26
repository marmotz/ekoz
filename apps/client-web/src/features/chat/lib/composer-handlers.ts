/** What the editor's key handlers call; they are built once with the editor. */
export interface ComposerHandlers {
  send: () => void;
  isSuggestionOpen: () => boolean;
  openLink: () => void;
}

/**
 * Lets extensions created once call the latest callbacks of the component: `handlers`
 * are stable and forward to whatever `update` last received.
 */
export function createComposerHandlers() {
  let latest: ComposerHandlers = {
    send: () => {},
    isSuggestionOpen: () => false,
    openLink: () => {},
  };

  return {
    handlers: {
      send: () => latest.send(),
      isSuggestionOpen: () => latest.isSuggestionOpen(),
      openLink: () => latest.openLink(),
    } satisfies ComposerHandlers,
    update(next: ComposerHandlers) {
      latest = next;
    },
  };
}
