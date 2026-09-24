/**
 * Public room directory: listing and search of public channels
 * (web-client-rooms technical design §3).
 */

import type { SessionManager } from '../session/session-manager.js';
import type { DirectoryListResponse } from '../types/wire.js';

export interface ListDirectoryParams {
  /** Full-text search; a query under 3 characters matches a name or topic prefix. */
  query?: string;
  cursor?: string;
}

export interface DirectoryResource {
  list(params?: ListDirectoryParams): Promise<DirectoryListResponse>;
}

export function createDirectoryResource(session: SessionManager): DirectoryResource {
  return {
    list(params = {}) {
      return session.request<DirectoryListResponse>('GET', '/directory', {
        query: { query: params.query, cursor: params.cursor },
      });
    },
  };
}
