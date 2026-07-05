#!/usr/bin/env bash
# Echo Weather — post-deploy smoke tests (run on server or locally).
#
# On the server, Apache may still have the default 000-default site on 127.0.0.1.
# Smoke tests send Host: example.com so requests hit your vhost (override with SMOKE_HOST).
#
# Usage:
#   ./scripts/smoke.sh
#   SMOKE_HOST=your.domain ./scripts/smoke.sh
#   BASE_URL=https://your.domain ./scripts/smoke.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_ROOT="$ROOT" bash "$ROOT/scripts/check-versions.sh"

BASE_URL="${BASE_URL:-http://127.0.0.1}"
BASE_URL="${BASE_URL%/}"
SMOKE_HOST="${SMOKE_HOST:-example.com}"