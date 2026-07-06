#!/usr/bin/env bash
# Echo Weather — rsync deploy for servers WITHOUT a git clone in the web root.
#
# If the repo is cloned into /var/www/echoweather (recommended), use update.sh instead.
#
# Usage:
#   DEPLOY_HOST=user@your-server ./deploy.sh
#   DEPLOY_HOST=user@your-server ./deploy.sh --smoke
#   DEPLOY_HOST=user@your-server ./deploy.sh --smoke-only
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
REMOTE_STAGING="${REMOTE_STAGING:-~/echoweather-deploy}"
REMOTE_WWW="${REMOTE_WWW:-/var/www/echoweather}"

DO_SMOKE=0
SMOKE_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --smoke) DO_SMOKE=1 ;;
    --smoke-only) SMOKE_ONLY=1; DO_SMOKE=1 ;;
    -h|--help)
      echo "Usage: DEPLOY_HOST=user@host ./deploy.sh [--smoke] [--smoke-only]"
      echo "  DEPLOY_HOST     SSH target (required), e.g. user@your-server"
      echo "  REMOTE_STAGING  default: ~/echoweather-deploy"
      echo "  REMOTE_WWW      default: /var/www/echoweather"
      echo ""
      echo "For git-clone installs in REMOTE_WWW, use update.sh instead."
      exit 0
      ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

if [[ -z "${DEPLOY_HOST:-}" ]]; then
  echo "DEPLOY_HOST is required (e.g. DEPLOY_HOST=user@your-server ./deploy.sh)" >&2
  exit 1
fi

RSYNC_FILES=(
  index.html
  app.css
  app.js
  storm.js
  radar.js
  boot.js
  manifest.json
  sw.js
  .htaccess
  logo.svg
  icon.svg
  icon-maskable.svg
  icon-192.png
  icon-512.png
  apple-touch-icon.png
  og-image.png
  og-image.svg
  api
  lib
  router.php
  config.example.php
  deploy.sh
  update.sh
  scripts
)

if [[ "$SMOKE_ONLY" -eq 0 ]]; then
  bash "$ROOT/scripts/check-versions.sh"
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
  echo "Running smoke tests on server (127.0.0.1, Host: ${SMOKE_HOST:-example.com})..."
  ssh "$DEPLOY_HOST" "SMOKE_HOST=${SMOKE_HOST:-example.com} BASE_URL=http://127.0.0.1 bash -s" < "$ROOT/scripts/smoke.sh"
fi
