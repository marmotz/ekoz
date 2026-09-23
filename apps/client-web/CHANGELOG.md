# Changelog

Format [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning
[SemVer](https://semver.org/).

## [Unreleased]

### Added

- Scaffold the web client on TanStack Start (Vite, Tailwind CSS 4, strict TypeScript, `@/*` alias), with a placeholder home route and Vitest + Testing Library setup.
- Add the `eslint-plugin-boundaries` module-boundary check (`lint:boundaries`): features may only import `shared` and themselves; guarded by a fixture-based test.
- Add shadcn/ui base components (`button`, `dropdown-menu`, `sheet`, `avatar`, `sonner`, `skeleton`) and the `cn()` helper under `src/shared`.
- Add TanStack Query integration: a query client per request, no retry on authentication or 4xx errors, unhandled `AuthenticationError` signal, SSR dehydration/hydration and dev tools.
- Add the light / dark / system theme (`ThemeProvider`, `ThemeToggle`, anti-flash inline script).
- Add react-i18next (French + English) with a per-request instance, `Accept-Language` detection on the server, a `LanguageSwitcher` and typed translation keys.
- Wire the SDK client and the session: `localStorage` session store, `SdkProvider`, `useSession()`, `RequireAuth` and sign-out on a lost session (#34).
- Add the application shell: responsive sidebar fed by a navigation registry, top bar with page title, language switcher and theme toggle, and `/` and `/login` placeholder routes (#35).
- Check in CI that a change under `src/` comes with a changelog entry (#36).
- Add a sidebar section registry, rendered under the navigation in the fixed sidebar and the mobile sheet, and a `useMe()` hook over `GET /me` (#65).
- Add the `_app` and `_auth` route layouts: every page inside the application shell lives under `routes/_app/`, anonymous pages get a centered card without sidebar (`AuthLayout`), plus `GuestOnly`, shadcn/ui `input`, `label` and `card`, and `auth` and `me` stubs in the SDK test double (#92).
- Add the signed-in user menu in the top bar: display name with initials, and sign out (#93).
- Add the generated TanStack Form hooks (`@kurotako/gen-react-tanstack`, `src/generated`) for the authentication request bodies, a `PasswordInput`, form field wrappers and the server error code table with its `useAuthError` hook (#94).
- Add the `/check-email` screen, the resend verification form and `useAuthPolicy()` (#95).
- Add the sign-in page at `/login` (#96).
- Add the registration page at `/register` for the `open`, `invite` and `admin` registration modes (#97).
- Add the email verification page at `/verify-email` (#98).
- Add the `/forgot-password` and `/reset-password` pages (#99).
- Add shared profile pieces: a user menu entry registry (`registerUserMenuItem`) rendered by the user menu, `useAvatarSrc` and `UserAvatar` (avatar fetched through the SDK and shown as an object URL), shadcn/ui `textarea` and `dialog`, `sessions` and `users` stubs in the SDK test double, generated forms for the account request bodies, and the account error table (#105).
- Move `PasswordInput` and the form field wrappers (`FormTextField`, `FormError`) from `features/auth` to `shared/ui`, and the validation message mapping to `shared/i18n` (#105).
- Add the `/account` page with the profile and avatar sections (#106).
- Add the identifier (with its change policy, cooldown and pending request), email (with pending verification and resend) and password sections to `/account` (#107).
- Add the sessions list (rename, revoke, sign out other sessions) and the account deletion dialog to `/account` (#108).
