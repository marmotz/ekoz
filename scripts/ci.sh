#! /bin/bash
#
# Local CI runner, mirroring .github/workflows/ci.yml.
# Runs the independent jobs in parallel and reports a clear pass/fail summary.

set -u
cd "$(dirname "$0")/.."

BASE_REF="${1:-origin/develop}"

LOG_DIR="$(mktemp -d)"

declare -a JOB_NAMES=(lint build test test-server-integration changelog docker)
declare -A JOB_CMD=(
  [lint]="bun run lint"
  [build]="bun run lint:boundaries && bun run typecheck && bun run --filter '@ekozhq/admin' build && bun run --filter '@ekozhq/client-web' build && bun run openapi:check && bun run check"
  [test]="bun run test && bun run --filter '@ekozhq/server' test:unit"
  [test-server-integration]="bun run --filter '@ekozhq/server' test:integration"
  [changelog]="bash scripts/check-changelog.sh '$BASE_REF'"
  [docker]="docker build -f apps/server/Dockerfile -t ekoz-server:ci ."
)

echo "==> Setup: bun install + build SDK"
if ! bun install > "$LOG_DIR/setup.log" 2>&1 || ! bun run build >> "$LOG_DIR/setup.log" 2>&1; then
  echo "Setup failed, see below:"
  cat "$LOG_DIR/setup.log"
  exit 1
fi

declare -A JOB_PID
for name in "${JOB_NAMES[@]}"; do
  echo "==> Starting job: $name"
  bash -c "${JOB_CMD[$name]}" > "$LOG_DIR/$name.log" 2>&1 &
  JOB_PID[$name]=$!
done

declare -A JOB_STATUS
for name in "${JOB_NAMES[@]}"; do
  if wait "${JOB_PID[$name]}"; then
    JOB_STATUS[$name]=0
  else
    JOB_STATUS[$name]=$?
  fi
done

echo
echo "==================== CI summary ===================="
overall=0
for name in "${JOB_NAMES[@]}"; do
  if [ "${JOB_STATUS[$name]}" -eq 0 ]; then
    printf "  OK   %s\n" "$name"
  else
    printf "  FAIL %s (exit %s) — log: %s\n" "$name" "${JOB_STATUS[$name]}" "$LOG_DIR/$name.log"
    overall=1
  fi
done
echo "======================================================"

if [ "$overall" -ne 0 ]; then
  echo
  echo "---- Failed job output ----"
  for name in "${JOB_NAMES[@]}"; do
    if [ "${JOB_STATUS[$name]}" -ne 0 ]; then
      echo
      echo "### $name ($LOG_DIR/$name.log) ###"
      cat "$LOG_DIR/$name.log"
    fi
  done
  echo
  echo "Logs kept in $LOG_DIR"
else
  rm -rf "$LOG_DIR"
fi

exit "$overall"
