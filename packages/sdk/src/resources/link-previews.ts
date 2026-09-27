/**
 * Link preview metadata for a URL (technical.md §S9, `link_previews.enabled`).
 */

import type { SessionManager } from '../session/session-manager.js';
import type { LinkPreviewView } from '../types/wire.js';

export interface LinkPreviewsResource {
  /**
   * `POST /link-previews`: fetches (or returns cached) preview metadata for
   * `url`. `null` when the page carried no usable metadata (a `204`), not an
   * error.
   */
  fetch(url: string): Promise<LinkPreviewView | null>;
}

export function createLinkPreviewsResource(session: SessionManager): LinkPreviewsResource {
  return {
    async fetch(url) {
      const view = await session.request<LinkPreviewView | undefined>('POST', '/link-previews', {
        body: { url },
      });
      return view ?? null;
    },
  };
}
