#!/usr/bin/env bash
# Vercel Ignored Build Step: exit 0 skips the build, any other exit builds.
# Usage: bash ../../scripts/vercel-ignore-build.sh <repo-relative paths the app builds from>
# Skips only when none of those paths (or the root build files) changed since
# this project's last successful deploy. No usable base SHA (first deploy, or
# the base is outside Vercel's shallow clone) means build.
cd "$(git rev-parse --show-toplevel)" || exit 1

base="${VERCEL_GIT_PREVIOUS_SHA:-}"
if [ -z "$base" ] || ! git cat-file -e "${base}^{commit}" 2>/dev/null; then
  echo "No previous deploy SHA in this clone; building."
  exit 1
fi

if git diff --quiet "$base" HEAD -- "$@" \
  package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json .npmrc; then
  echo "Nothing this app builds from changed since $base; skipping build."
  exit 0
fi

echo "Changes since $base affect this app; building."
exit 1
