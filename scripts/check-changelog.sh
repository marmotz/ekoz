#!/usr/bin/env bash
#
# Changelog discipline check (CONTRIBUTING.md): a change under a workspace's `src/`
# must come with a changelog entry.
#   - apps/*: a line added to `apps/<app>/CHANGELOG.md` under `## [Unreleased]`.
#     For apps/docs the content is the product, so its "source" is `src/`, `docs/`,
#     and `sdk/` (the generated `sdk/api/` is git-ignored, never diffed).
#   - packages/sdk: a new changeset (`bunx changeset`), its CHANGELOG is generated.
# Test files (`*.test.*`) do not count as a `src/` change.
#
# Usage: scripts/check-changelog.sh [--worktree | --staged] <base-ref>
#   (default)   compares <base-ref>...HEAD: committed changes only (CI).
#   --worktree  compares the merge base to the working tree, including uncommitted
#               and untracked files (local check before committing).
#   --staged    compares the merge base to the index (pre-commit hook).

set -euo pipefail

mode=range
case "${1:-}" in
  --worktree) mode=worktree; shift ;;
  --staged) mode=staged; shift ;;
esac

base="${1:?usage: check-changelog.sh [--worktree | --staged] <base-ref>}"
range="${base}...HEAD"
status=0

if [ "$mode" != range ]; then
  merge_base="$(git merge-base "$base" HEAD)"
fi

if [ "$mode" = worktree ]; then
  # Stage everything in a throwaway index so untracked files show up in the diff
  # without touching the real one.
  tmp_index="$(mktemp)"
  trap 'rm -f "$tmp_index"' EXIT
  cp "$(git rev-parse --git-path index)" "$tmp_index"
  GIT_INDEX_FILE="$tmp_index" git add -A
fi

# `git diff` over the compared states; extra arguments are passed through.
gdiff() {
  case "$mode" in
    range) git diff "$range" "$@" ;;
    staged) git diff --cached "$merge_base" "$@" ;;
    worktree) GIT_INDEX_FILE="$tmp_index" git diff --cached "$merge_base" "$@" ;;
  esac
}

fail() {
  echo "::error::$1"
  status=1
}

# Source directories of a workspace that count as a change needing a changelog entry.
src_paths() {
  case "$1" in
    apps/docs) echo "$1/src $1/docs $1/sdk" ;;
    *) echo "$1/src" ;;
  esac
}

src_changed() {
  local -a paths
  read -ra paths <<<"$(src_paths "$1")"
  [ -n "$(gdiff --name-only -- "${paths[@]}" ':(exclude,glob)**/*.test.*')" ]
}

# Succeeds when the diff adds a non-blank line above the first released version heading.
has_unreleased_entry() {
  local file="$1" first_release
  first_release="$(grep -nE '^## \[[0-9]' "$file" | head -n 1 | cut -d: -f1 || true)"
  gdiff -U0 -- "$file" | awk -v limit="$first_release" '
    /^@@/ { match($0, /\+[0-9]+/); line = substr($0, RSTART + 1, RLENGTH - 1) + 0; next }
    /^\+\+\+/ { next }
    /^\+/ {
      if ($0 !~ /^\+[[:space:]]*$/ && (limit == "" || line < limit)) found = 1
      line++
    }
    END { exit found ? 0 : 1 }
  '
}

for app in apps/admin apps/client-web apps/docs apps/server; do
  if src_changed "$app" && ! has_unreleased_entry "$app/CHANGELOG.md"; then
    fail "$app source changed: add an entry under '## [Unreleased]' in $app/CHANGELOG.md"
  fi
done

if src_changed packages/sdk; then
  if ! gdiff --name-only --diff-filter=A -- .changeset |
    grep -E '\.md$' | grep -qv 'README.md'; then
    fail "packages/sdk/src changed: add a changeset (run 'bunx changeset')"
  fi
fi

exit "$status"
