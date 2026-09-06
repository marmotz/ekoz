#!/bin/sh
set -eu

# The image ships no `config.toml`; every infra parameter comes from the
# environment as `EKOZ_<SECTION>__<KEY>` (see config.example.toml). `DATABASE_URL`
# is the one conventional name Prisma also needs, so accept it as the source of
# truth and mirror it to the parameter the app resolver reads.
if [ -n "${DATABASE_URL:-}" ] && [ -z "${EKOZ_DATABASE__URL:-}" ]; then
  export EKOZ_DATABASE__URL="$DATABASE_URL"
elif [ -z "${DATABASE_URL:-}" ] && [ -n "${EKOZ_DATABASE__URL:-}" ]; then
  export DATABASE_URL="$EKOZ_DATABASE__URL"
fi

# Apply pending migrations before the app starts. `--no-interactive` requires the
# destructive-op consent to be pre-granted; on an additive deploy nothing is
# asked. Fails loudly (and the container with it) if the database is unreachable
# or a migration errors.
echo "==> prisma db migrate"
bunx prisma db migrate --no-interactive

echo "==> starting: $*"
exec "$@"
