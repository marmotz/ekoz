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
