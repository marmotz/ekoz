# @ekozhq/client-web

Ekoz demonstration web client. Exercises every server feature as it ships. Talks to the server exclusively through `@ekozhq/sdk`.

Stack: React, TanStack Start (Vite), TypeScript, Tailwind CSS 4, shadcn/ui, Vitest. See [web client stack](../../docs/technical/web-client-stack.md).

```bash
cp apps/client-web/.env.example apps/client-web/.env   # server domain, VITE_EKOZ_SERVER
bun run --filter @ekozhq/client-web dev                # http://localhost:5173
```

In dev the SDK skips discovery and calls `VITE_EKOZ_SERVER` directly (plain HTTP). The server must
allow this origin: `EKOZ_HTTP__CORS_ALLOWED_ORIGINS="http://localhost:5173"` in `apps/server/.env`.

`@ekozhq/sdk` is a `workspace:*` dependency: `bun install` links `packages/sdk`, and the
root `bun run build` builds it. No `bun link` needed. Design notes:
[web client bootstrap](../../docs/technical/web-client-bootstrap.md).

| Script                | Effect                                              |
| --------------------- | --------------------------------------------------- |
| `dev`                 | Vite dev server (SSR).                              |
| `build` / `start`     | Production build / run it as a Node process.        |
| `typecheck`           | `tsc --noEmit`.                                     |
| `lint`                | Biome.                                              |
| `lint:boundaries`     | ESLint: module boundaries, React rules.             |
| `test`                | Vitest.                                             |
