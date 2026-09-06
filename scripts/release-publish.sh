#!/usr/bin/env bash
#
# Publish every workspace package that is not yet on npm at its current version.
#
# Why this script instead of `changeset publish`:
#   - `changeset publish` shells to `bun publish` (the repo's packageManager is bun),
#     and bun's publish does not support npm OIDC trusted publishing.
#   - `npm publish` supports OIDC, but does NOT rewrite the `workspace:` protocol.
#   So we pack with bun (which rewrites `workspace:^` -> `^<version>`) and upload the
#   resulting tarball with npm (which authenticates via OIDC in CI).
#
# Environment:
#   GITHUB_ACTIONS=true  -> add `--provenance` (needs a public repo + id-token: write),
#                           and push tags + create GitHub Releases
#   RELEASE_PUSH=1       -> push tags + create GitHub Releases from a local run too
#   RELEASE_DRY_RUN=1    -> `npm publish --dry-run`, no tags, no push, no GitHub Releases
#
# Local bootstrap (first release, before any trusted publisher exists):
#   npm login            # interactive, provides the 2FA OTP on publish
#   bun run release      # this script; npm prompts for the OTP per package
#   # inspect npm, then: git push origin --tags   (or re-run with RELEASE_PUSH=1)
#
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

dry_run="${RELEASE_DRY_RUN:-}"
provenance_args=()
if [ "${GITHUB_ACTIONS:-}" = "true" ]; then
  provenance_args=(--provenance)
fi

pack_dir="$(mktemp -d)"
trap 'rm -rf "$pack_dir"' EXIT

echo "==> Building packages"
bun run build

published_tags=()
published_dirs=()

for pkg_json in packages/*/package.json; do
  dir="$(dirname "$pkg_json")"
  name="$(node -p "require('./$pkg_json').name")"
  version="$(node -p "require('./$pkg_json').version")"
  is_private="$(node -p "require('./$pkg_json').private === true")"

  if [ "$is_private" = "true" ]; then
    echo "==> $name is private, skipping"
    continue
  fi

  if npm view "$name@$version" version >/dev/null 2>&1; then
    echo "==> $name@$version already on npm, skipping"
    continue
  fi

  echo "==> Packing $name@$version"
  tarball="$( (cd "$dir" && bun pm pack --quiet --destination "$pack_dir") )"

  echo "==> Publishing $name@$version"
  if [ -n "$dry_run" ]; then
    npm publish "$tarball" --access public "${provenance_args[@]}" --dry-run
    continue
  fi

  npm publish "$tarball" --access public "${provenance_args[@]}"

  tag="$name@$version"
  if git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
    echo "==> tag $tag already exists"
  else
    git tag "$tag"
  fi
  published_tags+=("$tag")
  published_dirs+=("$dir")
done

if [ -n "$dry_run" ]; then
  echo "==> Dry run complete"
  exit 0
fi

if [ ${#published_tags[@]} -eq 0 ]; then
  echo "==> Nothing published"
  exit 0
fi

if [ "${GITHUB_ACTIONS:-}" != "true" ] && [ -z "${RELEASE_PUSH:-}" ]; then
  echo "==> Published and tagged locally: ${published_tags[*]}"
  echo "==> Not pushing tags / not creating GitHub Releases (set RELEASE_PUSH=1 to)."
  exit 0
fi

echo "==> Pushing tags: ${published_tags[*]}"
git push origin "${published_tags[@]}"

if ! command -v gh >/dev/null 2>&1; then
  echo "==> gh not available, skipping GitHub releases (tags pushed)"
  exit 0
fi

for i in "${!published_tags[@]}"; do
  tag="${published_tags[$i]}"
  changelog="${published_dirs[$i]}/CHANGELOG.md"
  notes_file="$pack_dir/notes-${tag//\//-}.md"
  if [ -f "$changelog" ]; then
    # first "## <version>" block of a changesets CHANGELOG
    awk '/^## / { if (seen) exit; seen=1; next } seen { print }' "$changelog" >"$notes_file"
  fi
  if [ ! -s "${notes_file:-/nonexistent}" ]; then
    printf 'See CHANGELOG.md for %s.\n' "$tag" >"$notes_file"
  fi
  echo "==> GitHub release $tag"
  gh release create "$tag" --title "$tag" --notes-file "$notes_file"
done
