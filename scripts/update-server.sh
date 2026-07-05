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
REPO_USER="${REPO_USER:-$(whoami)}"
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
      echo "  REPO_USER    default: current user (must own .git for git pull)"
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

# Ensure .git is owned by the SSH user before fetch/pull.
if ! [[ -O .git ]] || ! [[ -w .git ]]; then
  echo "Fixing repository permissions (.git not owned/writable by $REPO_USER)..."
  APP_DIR="$APP_DIR" REPO_USER="$REPO_USER" WEB_USER="$WEB_USER" WEB_GROUP="$WEB_GROUP" \
    bash "$APP_DIR/scripts/fix-permissions.sh"
fi

git config --global --add safe.directory "$APP_DIR" 2>/dev/null || true

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

# Re-apply permissions after pull (new files may need group-read for Apache).
APP_DIR="$APP_DIR" REPO_USER="$REPO_USER" WEB_USER="$WEB_USER" WEB_GROUP="$WEB_GROUP" \
  bash "$APP_DIR/scripts/fix-permissions.sh"

echo
echo "Compare config.example.php with config.local.php and merge any new keys by hand."
echo "Update complete."

if [[ "$DO_SMOKE" -eq 1 ]]; then
  echo
  echo "Running smoke tests (127.0.0.1)..."
  BASE_URL=http://127.0.0.1 bash "$APP_DIR/scripts/smoke.sh"
fi
