# POC — NestJS 12 + Prisma + Bun

**Date**: 2026-08-29
**Goal**: validate that the chosen server stack ([server stack](server-stack.md))
works, in particular NestJS decorators (`emitDecoratorMetadata`) under the Bun
runtime and Prisma access to PostgreSQL.

## Verdict

**The stack works.** No blocker.

## What was tested

| Item | Version | Result |
|------|---------|--------|
| Runtime | Bun 1.4.0 | OK |
| NestJS (ESM) | 12.0.1 | Bootstrap OK under `bun run`, top-level `await` OK |
| Type-based dependency injection | — | OK — `HealthController(private prisma: PrismaService)` resolved, so `emitDecoratorMetadata` works under Bun |
| Prisma Client | 7.10.0 (see note) | OK |
| Generator | `prisma-client` (new, emits `.ts`) | OK — no build step, ideal for Bun |
| Driver adapter | `@prisma/adapter-pg` | OK — `create`, `count`, `$queryRaw` run against PostgreSQL 18 |
| `prisma db push` | OK |
| `prisma migrate dev` | OK (fresh database) |
| Tests | Vitest 4.1.11 (oxc transform) | OK — NestJS DI tested via `@nestjs/testing`, decorators resolved |
| Typecheck | `tsc` (TypeScript 7.0.2) | OK on the source code |

## Note on Prisma versions

At the time of the POC, `@prisma/client` `latest` was still `7.10.0` and the
`prisma` CLI was on `8.0.0-rc.12`. The POC ran against `7.10.0` because the 8.x
client was not published yet.

**Project decision (revised)**: start directly on the Prisma `8.0.0-rc` line —
the final release is imminent and will land during Ekoz development. Prisma 7
already ships the target architecture of Prisma 8 (new `prisma-client`
generator, mandatory driver adapters), so the POC findings carry over.

## Prisma 7/8 architecture changes to adopt from the start

- **`url` is not allowed in the schema `datasource` block.** The connection is
  configured through `prisma.config.ts` (for migrations) and through a **driver
  adapter** passed to the `PrismaClient` constructor (for runtime).
- `prisma.config.ts` **no longer auto-loads `.env`**: load it explicitly
  (`import 'dotenv/config'` or `process.loadEnvFile()`).
- The `prisma-client` generator writes `.ts` files into the repo (mandatory
  `output` path) — commit them or generate in `postinstall` / CI.
- `prisma migrate reset` triggers a consent guardrail (env variable
  `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`) — relevant for scripts and CI.

## Prisma service shape under NestJS

```ts
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  }
  async onModuleInit()   { await this.$connect(); }
  async onModuleDestroy() { await this.$disconnect(); }
}
```

Required TypeScript config: `experimentalDecorators` + `emitDecoratorMetadata`,
`module`/`moduleResolution` set to `NodeNext`.

## POC sources

Throwaway project, kept outside the repositories, not committed.
