# @ekoz/sdk

JavaScript/TypeScript SDK for the [Ekoz](https://github.com/ekoz-chat) protocol. It encapsulates all network access to
an Ekoz server so that no client ever has to call `fetch` directly.

> **Status:** early development. Distributed via `bun link` / `npm link` from a
> neighbouring checkout only; not published to npm yet (ADR 0025).

## Install (local development)

```bash
bun install
bun run build
bun link
```

Then, from a consumer checkout:

```bash
bun link @ekoz/sdk
```

## Scripts

| Script              | Purpose                                    |
|---------------------|--------------------------------------------|
| `bun run build`     | Dual ESM + CJS + `.d.ts` bundle via tsdown |
| `bun run test`      | Unit tests (Vitest)                        |
| `bun run typecheck` | `tsc --noEmit`                             |
| `bun run lint`      | ESLint (flat config)                       |

## Contributing

Every visible change needs a changeset (`bun run changeset`). Design decisions are recorded as ADRs in the [
`spec`](https://github.com/ekoz-chat/spec)
repository, referenced by number.

The full usage guide is added by a later task.
