# Front — i18n react-i18next (SSR-safe)

**Status**: todo
**Type**: front
**Issue**: [#33](https://github.com/marmotz/ekoz/issues/33)

Référence : [../features/web-client-foundations/technical.md §9](../features/web-client-foundations/technical.md#9-i18n).

## À faire

1. `src/app/i18n.ts` : `createI18n(lng)` → `i18next.createInstance()` (nouvelle
   instance par requête) + `initReactI18next`. `supportedLngs: ['en', 'fr']`,
   `fallbackLng: 'en'`, `ns: ['common']`, `defaultNS: 'common'`, `resources`
   statiques.
2. `src/shared/i18n/locales/{en,fr}/common.json` : clés du shell (navigation,
   thème, langue, titres placeholder).
3. `src/server/language.ts` : `createServerFn({ method: 'GET' })` qui lit
   l'en-tête `Accept-Language` de la requête et renvoie `'en' | 'fr'`
   (fallback `'en'`).
4. `__root.tsx` `loader` : appelle `language.ts`, renvoie `{ locale }` ;
   `createI18n(locale)` monté dans les providers, `<html lang>` posé depuis
   `locale`. (Le branchement `__root` final est en T-shell ; exposer ici les
   pièces réutilisables.)
5. Client : après hydratation, si `localStorage.ekoz.lang` diffère,
   `i18n.changeLanguage(...)`.
6. `LanguageSwitcher` (`src/shared/layout/`) : `DropdownMenu` fr / en,
   `changeLanguage` + persistance `ekoz.lang` + maj `<html lang>`.
7. `src/shared/i18n/use-translation.ts` : ré-export `useTranslation` + module
   augmentation `react-i18next` `CustomTypeOptions` (type des clés dérivé de
   `en/common.json`).
8. Tests : `server/language.ts` (`Accept-Language: fr` → `fr` ; inconnu →
   `en`) ; `LanguageSwitcher` change + persiste + met à jour `<html lang>` ;
   clé inconnue → typecheck rouge (test de type ou revue).
9. Entrée `CHANGELOG.md`.

## Dépendances

- [28-scaffold-tanstack-start](5-conv-dm-and-group-dm.md)
- [30-shadcn-ui-base](7-conv-messages.md)
