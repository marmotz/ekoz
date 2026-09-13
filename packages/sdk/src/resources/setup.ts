/**
 * First-owner setup binding (technical.md §10). `POST /setup/owner` is
 * unauthenticated (guarded server-side by setup state, not by a bearer token)
 * and establishes the session on success.
 */

import type { SessionManager } from '../session/session-manager.js';
import type { HttpClient } from '../transport/http-client.js';
import type { SetupOwnerBody, SetupOwnerResponse } from '../types/wire.js';

export interface SetupResource {
  createOwner(body: SetupOwnerBody): Promise<SetupOwnerResponse>;
}

export function createSetupResource(http: HttpClient, session: SessionManager): SetupResource {
  return {
    async createOwner(body) {
      const result = await http.request<SetupOwnerResponse>('POST', '/setup/owner', { body });
      await session.establish({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn,
        sessionId: result.session.id,
        identifier: result.user.identifier,
      });
      return result;
    },
  };
}
