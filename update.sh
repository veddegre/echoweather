#!/usr/bin/env bash
# Echo Weather — git pull update for servers with the repo cloned into the web root.
#
# From your laptop (SSH into the server and run the update there):
#   DEPLOY_HOST=user@your-server ./update.sh --smoke
#
# On the server (inside the clone, e.g. /var/www/echoweather):
#   ./update.sh --smoke
#
# For first-time rsync installs without git on the server, use deploy.sh instead.
#
# Run as your SSH user (not sudo) — the script uses sudo internally for permissions.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="${APP_DIR:-/var/www/echoweather}"
GIT_BRANCH="${GIT_BRANCH:-main}"

DO_SMOKE=0
SMOKE_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --smoke) DO_SMOKE=1 ;;
    --smoke-only) SMOKE_ONLY=1; DO_SMOKE=1 ;;
    -h|--help)
      echo "Usage: ./update.sh [--smoke] [--smoke-only]"
      echo "       DEPLOY_HOST=user@host ./update.sh [--smoke]"
      echo ""
      echo "  DEPLOY_HOST   SSH target when running from your laptop"
      echo "  APP_DIR       default: /var/www/echoweather"
      echo "  GIT_BRANCH    default: main"
      echo ""
      echo "Git-clone installs: run on the server after git push, or via DEPLOY_HOST."
      echo "Rsync installs: use deploy.sh instead."
      exit 0
      ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

run_update() {
  local extra_args=()
  [[ "$DO_SMOKE" -eq 1 ]] && extra_args+=(--smoke)
  APP_DIR="$APP_DIR" GIT_BRANCH="$GIT_BRANCH" bash "$ROOT/scripts/update-server.sh" "${extra_args[@]}"
}

if [[ -n "${DEPLOY_HOST:-}" ]]; then
  if [[ "$SMOKE_ONLY" -eq 1 ]]; then
    echo "Running smoke tests on $DEPLOY_HOST (127.0.0.1, Host: ${SMOKE_HOST:-example.com})..."
    ssh "$DEPLOY_HOST" "SMOKE_HOST=${SMOKE_HOST:-example.com} BASE_URL=http://127.0.0.1 bash -s" < "$ROOT/scripts/smoke.sh"
  else
    echo "Updating on $DEPLOY_HOST:$APP_DIR"
    remote_cmd="APP_DIR=$APP_DIR GIT_BRANCH=$GIT_BRANCH bash -s"
    [[ "$DO_SMOKE" -eq 1 ]] && remote_cmd+=" --smoke"
    ssh "$DEPLOY_HOST" "$remote_cmd" < "$ROOT/scripts/update-server.sh"
  fi
elif [[ -d "$ROOT/.git" ]]; then
  APP_DIR="$ROOT"
  if [[ "$SMOKE_ONLY" -eq 1 ]]; then
    SMOKE_HOST="${SMOKE_HOST:-example.com}" BASE_URL="${BASE_URL:-http://127.0.0.1}" bash "$ROOT/scripts/smoke.sh"
  else
    run_update
  fi
else
  echo "Run from the server clone (e.g. /var/www/echoweather), or set DEPLOY_HOST." >&2
  echo "Example: DEPLOY_HOST=user@your-server ./update.sh --smoke" >&2
  exit 1
fi
