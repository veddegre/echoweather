#!/usr/bin/env bash
# Echo Weather — fix ownership so git pull works and Apache can read/serve files.
#
# Run on the server when git pull fails with "dubious ownership" or
# "cannot open .git/FETCH_HEAD: Permission denied" (usually after a blanket
# chown -R www-data:www-data on the repo).
#
# Usage:
#   ./scripts/fix-permissions.sh
#   APP_DIR=/var/www/echoweather REPO_USER=your-user ./scripts/fix-permissions.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/echoweather}"
REPO_USER="${REPO_USER:-${SUDO_USER:-$(whoami)}}"
WEB_USER="${WEB_USER:-www-data}"
WEB_GROUP="${WEB_GROUP:-www-data}"

if [[ ! -d "$APP_DIR/.git" ]]; then
  echo "Not a git repository: $APP_DIR" >&2
  exit 1
fi

run_root() {
  if [[ "$(id -u)" -eq 0 ]]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    echo "Root privileges required to fix permissions. Re-run with sudo." >&2
    exit 1
  fi
}

run_as_repo_user() {
  if [[ "$(id -un)" == "$REPO_USER" ]]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo -u "$REPO_USER" -H "$@"
  else
    echo "Cannot run as $REPO_USER without sudo." >&2
    exit 1
  fi
}

echo "Fixing permissions in $APP_DIR (repo user: $REPO_USER, web: $WEB_USER)"

# .git must belong to the SSH user who runs git pull — never www-data.
run_root chown -R "$REPO_USER:$REPO_USER" "$APP_DIR/.git"

# App files: deploy user + www-data group; readable by Apache, writable by deploy user.
run_root chown -R "$REPO_USER:$WEB_GROUP" "$APP_DIR"
run_root chown -R "$REPO_USER:$REPO_USER" "$APP_DIR/.git"
run_root find "$APP_DIR" -path "$APP_DIR/.git" -prune -o -type d -exec chmod 755 {} +
run_root find "$APP_DIR" -path "$APP_DIR/.git" -prune -o -type f -exec chmod 644 {} +
if [[ -f "$APP_DIR/update.sh" ]]; then
  run_root chmod +x "$APP_DIR/update.sh"
fi
if [[ -d "$APP_DIR/scripts" ]]; then
  run_root chmod +x "$APP_DIR/scripts/"*.sh
fi

# Gitignored server state
run_root mkdir -p "$APP_DIR/cache/pollen" "$APP_DIR/cache/ratelimit"
run_root chown -R "$WEB_USER:$WEB_GROUP" "$APP_DIR/cache"
run_root chmod -R 750 "$APP_DIR/cache"

if [[ -f "$APP_DIR/config.local.php" ]]; then
  run_root chown root:"$WEB_GROUP" "$APP_DIR/config.local.php"
  run_root chmod 640 "$APP_DIR/config.local.php"
fi

# Dubious-ownership guard when parent dirs are root-owned (common under /var/www).
# Must run as REPO_USER — not root — or git pull over SSH still fails.
run_as_repo_user git config --global --add safe.directory "$APP_DIR" 2>/dev/null || true

echo "Done. Verify with: cd $APP_DIR && git pull --ff-only"
