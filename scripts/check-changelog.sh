#!/usr/bin/env bash
#
# Changelog discipline check (CONTRIBUTING.md): a change under a workspace's `src/`
# must come with a changelog entry.
#   - apps/*: a line added to `apps/<app>/CHANGELOG.md` under `## [Unreleased]`.
#   - packages/sdk: a new changeset (`bunx changeset`), its CHANGELOG is generated.
# Test files (`*.test.*`) do not count as a `src/` change.
#
# Usage: scripts/check-changelog.sh <base-ref>   (compares <base-ref>...HEAD)

set -euo pipefail

base="${1:?usage: check-changelog.sh <base-ref>}"
range="${base}...HEAD"
status=0

fail() {
  echo "::error::$1"
  status=1
}

src_changed() {
  [ -n "$(git diff --name-only "$range" -- "$1/src" ':(exclude,glob)**/*.test.*')" ]
}

# Succeeds when the diff adds a non-blank line above the first released version heading.
has_unreleased_entry() {
  local file="$1" first_release
  first_release="$(grep -nE '^## \[[0-9]' "$file" | head -n 1 | cut -d: -f1 || true)"
  git diff -U0 "$range" -- "$file" | awk -v limit="$first_release" '
    /^@@/ { match($0, /\+[0-9]+/); line = substr($0, RSTART + 1, RLENGTH - 1) + 0; next }
    /^\+\+\+/ { next }
    /^\+/ {
      if ($0 !~ /^\+[[:space:]]*$/ && (limit == "" || line < limit)) found = 1
      line++
    }
    END { exit found ? 0 : 1 }
  '
}

for app in apps/admin apps/client-web apps/server; do
  if src_changed "$app" && ! has_unreleased_entry "$app/CHANGELOG.md"; then
    fail "$app/src changed: add an entry under '## [Unreleased]' in $app/CHANGELOG.md"
  fi
done

if src_changed packages/sdk; then
  if ! git diff --name-only --diff-filter=A "$range" -- .changeset |
    grep -E '\.md$' | grep -qv 'README.md'; then
    fail "packages/sdk/src changed: add a changeset (run 'bunx changeset')"
  fi
fi

exit "$status"
