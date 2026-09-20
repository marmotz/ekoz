import type commonEn from '@/shared/i18n/locales/en/common.json';

export { useTranslation } from 'react-i18next';

// Key types derive from the English catalogue: an unknown key fails the typecheck.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: { common: typeof commonEn };
  }
}
