#! /bin/bash

pwd

bun run lint

bun install
bun run build
bun run lint:boundaries
bun run typecheck
bun run --filter '@ekozhq/admin' build
bun run --filter '@ekozhq/client-web' build
bun run openapi:check
bun run check

bun run test
bun run --filter '@ekozhq/server' test:unit

bun run --filter '@ekozhq/server' test:integration

bash scripts/check-changelog.sh origin/develop

docker build -f apps/server/Dockerfile -t ekoz-server:ci .
