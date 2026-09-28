import { useTranslation as useTranslationBase } from 'react-i18next';

export type Namespace =
  | 'common'
  | 'setup'
  | 'users'
  | 'invitations'
  | 'settings'
  | 'storage'
  | 'files';

export function useTranslation(ns?: Namespace | Namespace[]) {
  return useTranslationBase(ns);
}
