#!/bin/sh
set -eu

# Apply pending migrations before the app starts. `--no-interactive` requires the
# destructive-op consent to be pre-granted; on an additive deploy nothing is
# asked. Fails loudly (and the container with it) if the database is unreachable
# or a migration errors.
echo "==> prisma db migrate"
bunx prisma db migrate --no-interactive

echo "==> starting: $*"
exec "$@"
