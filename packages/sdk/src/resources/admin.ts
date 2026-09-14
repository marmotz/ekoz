/**
 * Owner-only account and identifier-change administration (technical.md §10).
 */

import type { SessionManager } from '../session/session-manager.js';
import type {
  AccountView,
  AddOwnerBody,
  AdminCreateUserBody,
  AdminUserDetail,
  AdminUserListResponse,
  SuspendUserBody,
  UsernameApproved,
  UsernameRequestsListResponse,
} from '../types/wire.js';

/** `GET /admin/users` query params (technical.md §2.1). */
export interface AdminUserListParams {
  /** Substring match on `name` / `email` / `displayName`. */
  q?: string;
  status?: 'active' | 'suspended' | 'deleted';
  owner?: boolean;
  /** Opaque keyset cursor from a previous page's `nextCursor`. */
  cursor?: string;
  /** Default 50, max 200 (server-enforced). */
  limit?: number;
}

export interface AdminResource {
  users: {
    list(params?: AdminUserListParams): Promise<AdminUserListResponse>;
    get(id: string): Promise<AdminUserDetail>;
    create(body: AdminCreateUserBody): Promise<AccountView>;
    suspend(id: string, body: SuspendUserBody): Promise<void>;
    unsuspend(id: string): Promise<void>;
    delete(id: string): Promise<void>;
    triggerPasswordReset(id: string): Promise<{ accepted: true }>;
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
      list(params = {}) {
        return session.request<AdminUserListResponse>('GET', '/admin/users', {
          query: {
            q: params.q,
            status: params.status,
            owner: params.owner,
            cursor: params.cursor,
            limit: params.limit,
          },
        });
      },
      get(id) {
        return session.request<AdminUserDetail>('GET', `/admin/users/${encodeURIComponent(id)}`);
      },
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
      triggerPasswordReset(id) {
        return session.request<{ accepted: true }>(
          'POST',
          `/admin/users/${encodeURIComponent(id)}/password-reset`,
        );
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
