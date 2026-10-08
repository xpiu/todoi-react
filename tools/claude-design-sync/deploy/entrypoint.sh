#!/bin/sh
# Clone or update the repo on the volume, install its dependencies when the lockfile changed, then serve
# the tool from that clone. Configuration: deploy/dokploy.env.example.
set -eu

: "${CDS_GIT_URL:?Set CDS_GIT_URL to the https clone URL of the repo}"
REPO=/data/repo
BRANCH="${CDS_GIT_BRANCH:-main}"
mkdir -p "$HOME" "$TMPDIR"

# GITHUB_TOKEN is read when git asks, so it is never written to disk
if [ -n "${GITHUB_TOKEN:-}" ]; then
  # shellcheck disable=SC2016
  git config --global credential.helper '!f() { echo username=x-access-token; echo "password=${GITHUB_TOKEN}"; }; f'
fi
git config --global user.name "${GIT_AUTHOR_NAME:-Claude Design Sync}"
git config --global user.email "${GIT_AUTHOR_EMAIL:-design-sync@todoi.com}"

if [ ! -d "$REPO/.git" ]; then
  git clone --branch "$BRANCH" "$CDS_GIT_URL" "$REPO"
fi
cd "$REPO"
if [ "$(git symbolic-ref --short HEAD 2>/dev/null || true)" = "$BRANCH" ]; then
  git pull --ff-only -q || echo "cds: couldn't fast-forward $BRANCH; serving the checkout as it is"
else
  echo "cds: the checkout isn't on $BRANCH; serving it as it is"
fi

lock=$(sha1sum package-lock.json)
lock=${lock%% *}
if [ ! -f node_modules/.cds-lock ] || [ "$(cat node_modules/.cds-lock)" != "$lock" ]; then
  npm ci --no-audit --no-fund
  echo "$lock" > node_modules/.cds-lock
fi
npx playwright install chromium

exec npx tsx tools/claude-design-sync/src/cli.ts serve
