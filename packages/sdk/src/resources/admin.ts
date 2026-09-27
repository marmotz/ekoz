/**
 * Owner-only account and identifier-change administration (technical.md §10).
 */

import type { SessionManager } from '../session/session-manager.js';
import type {
  AccountView,
  AddOwnerBody,
  AdminAttachmentsPage,
  AdminCreateUserBody,
  AdminStorageDashboard,
  AdminUserDetail,
  AdminUserListResponse,
  AdminUserStorageView,
  ConfigParameterView,
  SuspendUserBody,
  UsernameApproved,
  UsernameRequestsListResponse,
} from '../types/wire.js';

/** `GET /admin/attachments` query params (technical.md §S11, issue #146). */
export interface AdminAttachmentsQueryParams {
  /** Substring match on the attachment's filename. */
  q?: string;
  uploaderId?: string;
  roomId?: string;
  type?: 'media' | 'documents';
  /** Opaque keyset cursor from a previous page's `nextCursor`. */
  before?: string;
  limit?: number;
}

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
    /** `GET /admin/users/:id/storage`: usage, pending uploads and effective quota. */
    storage(id: string): Promise<AdminUserStorageView>;
    /** `PUT /admin/users/:id/storage-quota`: override the quota (`null` = unlimited), audited. */
    setStorageQuota(id: string, quotaBytes: string | null): Promise<void>;
    /** `DELETE /admin/users/:id/storage-quota`: revert to the server default, audited. */
    resetStorageQuota(id: string): Promise<void>;
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
  settings: {
    /** `GET /admin/settings`: every parameter's resolved value and provenance. */
    list(): Promise<ConfigParameterView[]>;
    /** `PUT /admin/settings/:key`: set a runtime override (audited). */
    set(key: string, value: unknown): Promise<ConfigParameterView>;
    /** `DELETE /admin/settings/:key`: revert to the file / default value (audited). */
    reset(key: string): Promise<void>;
  };
  /** `GET /admin/storage`: global usage, capacity, top consumers and media tooling. */
  storage(): Promise<AdminStorageDashboard>;
  attachments: {
    /** `GET /admin/attachments`: cross-room attachment search, newest first. */
    search(params?: AdminAttachmentsQueryParams): Promise<AdminAttachmentsPage>;
  };
  blobs: {
    /** `DELETE /admin/blobs/:id`: force-remove from every attachment, preview and avatar (audited). */
    remove(id: string): Promise<void>;
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
      storage(id) {
        return session.request<AdminUserStorageView>(
          'GET',
          `/admin/users/${encodeURIComponent(id)}/storage`,
        );
      },
      setStorageQuota(id, quotaBytes) {
        return session.request<void>(
          'PUT',
          `/admin/users/${encodeURIComponent(id)}/storage-quota`,
          { body: { quotaBytes } },
        );
      },
      resetStorageQuota(id) {
        return session.request<void>(
          'DELETE',
          `/admin/users/${encodeURIComponent(id)}/storage-quota`,
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
    settings: {
      list() {
        return session.request<ConfigParameterView[]>('GET', '/admin/settings');
      },
      set(key, value) {
        return session.request<ConfigParameterView>(
          'PUT',
          `/admin/settings/${encodeURIComponent(key)}`,
          { body: { value } },
        );
      },
      reset(key) {
        return session.request<void>('DELETE', `/admin/settings/${encodeURIComponent(key)}`);
      },
    },
    storage() {
      return session.request<AdminStorageDashboard>('GET', '/admin/storage');
    },
    attachments: {
      search(params = {}) {
        return session.request<AdminAttachmentsPage>('GET', '/admin/attachments', {
          query: {
            q: params.q,
            uploaderId: params.uploaderId,
            roomId: params.roomId,
            type: params.type,
            before: params.before,
            limit: params.limit,
          },
        });
      },
    },
    blobs: {
      remove(id) {
        return session.request<void>('DELETE', `/admin/blobs/${encodeURIComponent(id)}`);
      },
    },
  };
}
