/**
 * Owner-only account and identifier-change administration (technical.md §10).
 */

import type { SessionManager } from '../session/session-manager.js';
import type {
  AccountView,
  AddOwnerBody,
  AdminCreateUserBody,
  SuspendUserBody,
  UsernameApproved,
  UsernameRequestsListResponse,
} from '../types/wire.js';

export interface AdminResource {
  users: {
    create(body: AdminCreateUserBody): Promise<AccountView>;
    suspend(id: string, body: SuspendUserBody): Promise<void>;
    unsuspend(id: string): Promise<void>;
    delete(id: string): Promise<void>;
  };
  owners: {
    add(body: AddOwnerBody): Promise<void>;
    remove(userId: string): Promise<void>;
  };
  usernameRequests: {
    list(status?: 'pending' | 'approved' | 'rejected'): Promise<UsernameRequestsListResponse>;
    approve(id: string): Promise<UsernameApproved>;
    reject(id: string): Promise<void>;
  };
}

export function createAdminResource(session: SessionManager): AdminResource {
  return {
    users: {
      create(body) {
        return session.request<AccountView>('POST', '/admin/users', { body });
      },
      suspend(id, body) {
        return session.request<void>('POST', `/admin/users/${encodeURIComponent(id)}/suspend`, {
          body,
        });
      },
      unsuspend(id) {
        return session.request<void>('POST', `/admin/users/${encodeURIComponent(id)}/unsuspend`);
      },
      delete(id) {
        return session.request<void>('DELETE', `/admin/users/${encodeURIComponent(id)}`);
      },
    },
    owners: {
      add(body) {
        return session.request<void>('POST', '/admin/owners', { body });
      },
      remove(userId) {
        return session.request<void>('DELETE', `/admin/owners/${encodeURIComponent(userId)}`);
      },
    },
    usernameRequests: {
      list(status) {
        return session.request<UsernameRequestsListResponse>('GET', '/admin/username-requests', {
          query: { status },
        });
      },
      approve(id) {
        return session.request<UsernameApproved>(
          'POST',
          `/admin/username-requests/${encodeURIComponent(id)}/approve`,
        );
      },
      reject(id) {
        return session.request<void>(
          'POST',
          `/admin/username-requests/${encodeURIComponent(id)}/reject`,
        );
      },
    },
  };
}
