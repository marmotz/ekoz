/**
 * The authenticated account's own profile, credentials and lifecycle
 * (technical.md §10). Every call here is authenticated.
 */

import type { SessionManager } from '../session/session-manager.js';
import type {
  AvatarUploaded,
  ChangeEmailBody,
  ChangeUsernameBody,
  DeleteMeBody,
  EmailAcceptedResponse,
  MeView,
  UpdateProfileBody,
  UsernameChangeOutcome,
} from '../types/wire.js';

export interface MeResource {
  get(): Promise<MeView>;
  updateProfile(body: UpdateProfileBody): Promise<MeView>;
  setAvatar(file: Blob | File): Promise<AvatarUploaded>;
  deleteAvatar(): Promise<void>;
  changeEmail(body: ChangeEmailBody): Promise<EmailAcceptedResponse>;
  changeUsername(body: ChangeUsernameBody): Promise<UsernameChangeOutcome>;
  deleteAccount(body: DeleteMeBody): Promise<void>;
}

export function createMeResource(session: SessionManager): MeResource {
  return {
    get() {
      return session.request<MeView>('GET', '/me');
    },

    updateProfile(body) {
      return session.request<MeView>('PATCH', '/me/profile', { body });
    },

    setAvatar(file) {
      const formData = new FormData();
      formData.append('file', file);
      return session.request<AvatarUploaded>('PUT', '/me/avatar', { formData });
    },

    deleteAvatar() {
      return session.request<void>('DELETE', '/me/avatar');
    },

    changeEmail(body) {
      return session.request<EmailAcceptedResponse>('POST', '/me/email', { body });
    },

    changeUsername(body) {
      return session.request<UsernameChangeOutcome>('PATCH', '/me/username', { body });
    },

    async deleteAccount(body) {
      await session.request<void>('DELETE', '/me', { body });
      await session.clear();
    },
  };
}
