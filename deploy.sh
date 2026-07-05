#!/usr/bin/env bash
# Echo Weather — rsync deploy to production (never syncs config.local.php).
#
# Usage:
#   ./deploy.sh
#   DEPLOY_HOST=user@host ./deploy.sh
#   ./deploy.sh --smoke          # deploy then run smoke tests on server
#   ./deploy.sh --smoke-only     # smoke tests on server only (no rsync)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_HOST="${DEPLOY_HOST:-veddegre@192.168.30.10}"
REMOTE_STAGING="${REMOTE_STAGING:-~/echoweather-deploy}"
REMOTE_WWW="${REMOTE_WWW:-/var/www/echoweather}"

DO_SMOKE=0
SMOKE_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --smoke) DO_SMOKE=1 ;;
    --smoke-only) SMOKE_ONLY=1; DO_SMOKE=1 ;;
    -h|--help)
      echo "Usage: ./deploy.sh [--smoke] [--smoke-only]"
      echo "  DEPLOY_HOST     default: veddegre@192.168.30.10"
      echo "  REMOTE_STAGING  default: ~/echoweather-deploy"
      exit 0
      ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

RSYNC_FILES=(
  index.html
  manifest.json
  sw.js
  config.js
  .htaccess
  logo.svg
  icon.svg
  og-image.png
  og-image.svg
  api
  lib
  router.php
  config.example.php
  config.example.js
  scripts
)

if [[ "$SMOKE_ONLY" -eq 0 ]]; then
  echo "Deploying to $DEPLOY_HOST:$REMOTE_STAGING"
  echo "Never syncing: config.local.php, cache/"
  rsync -avz --delete \
    --exclude 'config.local.php' \
    --exclude 'cache/' \
    "${RSYNC_FILES[@]/#/$ROOT/}" \
    "$DEPLOY_HOST:$REMOTE_STAGING/"

  echo "Installing to $REMOTE_WWW on server..."
  ssh "$DEPLOY_HOST" "sudo rsync -a $REMOTE_STAGING/ $REMOTE_WWW/ && sudo chown -R www-data:www-data $REMOTE_WWW"
  echo "Deploy complete."
fi

if [[ "$DO_SMOKE" -eq 1 ]]; then
  echo
  echo "Running smoke tests on server (127.0.0.1)..."
  ssh "$DEPLOY_HOST" "BASE_URL=http://127.0.0.1 bash -s" < "$ROOT/scripts/smoke.sh"
fi
