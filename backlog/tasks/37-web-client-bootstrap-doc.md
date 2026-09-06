# Front — document the web client bootstrap

**Status**: todo
**Type**: frontend

**Issue**: [#37](https://github.com/marmotz/ekoz/issues/37)

Reference: [../features/web-client-foundations/technical.md §14](../features/web-client-foundations/technical.md).

Once the client-web foundations land, record the bootstrap decisions as a prose
page under `docs/technical/` (the project dropped the ADR format — see
[../../CONTRIBUTING.md](../../CONTRIBUTING.md)).

## To do

1. Update [../../docs/technical/web-client-stack.md](../../docs/technical/web-client-stack.md)
   (or add `docs/technical/web-client-bootstrap.md` and link it from the
   technical README) with the decisions actually taken:
   - **plain Vite + React (current scaffold) vs TanStack Start** — resolve this
     first; the other client-web tasks assume Start;
   - app shell (router, layout, navigation registry, no cross-feature imports);
   - theme handling (`light` / `dark` / `system`, anti-flash script, persistence);
   - i18n setup (react-i18next, detection order, `fallbackLng`, per-feature namespaces);
   - session wiring (SDK client, `SessionStore` on `localStorage`, `RequireAuth`).
2. Keep it short: context, decision, consequences, alternatives in a table.

## Dependencies

- [35-app-shell-root-routes](35-app-shell-root-routes.md)
