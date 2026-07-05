#!/usr/bin/env bash
# Echo Weather — server-side git update (run on the server, or via update.sh over SSH).
#
# Preserves config.local.php and cache/ (both gitignored).
# Usage:
#   ./scripts/update-server.sh
#   APP_DIR=/var/www/echoweather ./scripts/update-server.sh --smoke
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/echoweather}"
GIT_BRANCH="${GIT_BRANCH:-main}"
WEB_USER="${WEB_USER:-www-data}"
WEB_GROUP="${WEB_GROUP:-www-data}"
DO_SMOKE=0

for arg in "$@"; do
  case "$arg" in
    --smoke) DO_SMOKE=1 ;;
    -h|--help)
      echo "Usage: ./scripts/update-server.sh [--smoke]"
      echo "  APP_DIR      default: /var/www/echoweather"
      echo "  GIT_BRANCH   default: main"
      echo "  WEB_USER     default: www-data"
      exit 0
      ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

if [[ ! -d "$APP_DIR" ]]; then
  echo "APP_DIR does not exist: $APP_DIR" >&2
  exit 1
fi

cd "$APP_DIR"

if [[ ! -d .git ]]; then
  echo "Not a git repository: $APP_DIR" >&2
  echo "Use deploy.sh for rsync-based installs, or git clone into APP_DIR first." >&2
  exit 1
fi

echo "Updating Echo Weather in $APP_DIR (branch $GIT_BRANCH)..."
git fetch origin
git pull --ff-only origin "$GIT_BRANCH"

# Gitignored server state — never overwritten by pull
if [[ ! -f config.local.php ]]; then
  echo
  echo "WARNING: config.local.php is missing."
  echo "  cp config.example.php config.local.php"
  echo "  then edit with your API keys before serving traffic."
  echo
fi

mkdir -p cache/pollen cache/ratelimit 2>/dev/null || true
if command -v sudo >/dev/null 2>&1; then
  sudo mkdir -p cache/pollen cache/ratelimit
  sudo chown -R "$WEB_USER:$WEB_GROUP" cache
  sudo chmod -R 750 cache
  if [[ -f config.local.php ]]; then
    sudo chown root:"$WEB_GROUP" config.local.php
    sudo chmod 640 config.local.php
  fi
else
  chmod -R 750 cache 2>/dev/null || true
fi

echo
echo "Compare config.example.php with config.local.php and merge any new keys by hand."
echo "Update complete."

if [[ "$DO_SMOKE" -eq 1 ]]; then
  echo
  echo "Running smoke tests (127.0.0.1)..."
  BASE_URL=http://127.0.0.1 bash "$APP_DIR/scripts/smoke.sh"
fi
