# @ekozhq/client-web

Ekoz demonstration web client. Exercises every server feature as it ships. Talks to the server exclusively through `@ekozhq/sdk`.

Stack: React, TanStack Start (Vite), TypeScript, Tailwind CSS 4, shadcn/ui, Vitest. See [web client stack](../../docs/technical/web-client-stack.md).

```bash
cp apps/client-web/.env.example apps/client-web/.env   # server domain, VITE_EKOZ_SERVER
bun run --filter @ekozhq/client-web dev                # http://localhost:5173
```

| Script                | Effect                                              |
| --------------------- | --------------------------------------------------- |
| `dev`                 | Vite dev server (SSR).                              |
| `build` / `start`     | Production build / run it as a Node process.        |
| `typecheck`           | `tsc --noEmit`.                                     |
| `lint`                | Biome.                                              |
| `lint:boundaries`     | ESLint: module boundaries, React rules.             |
| `test`                | Vitest.                                             |
