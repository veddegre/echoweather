#!/usr/bin/env bash
# Echo Weather — unit tests for core conversion / parse helpers.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
node --test "$ROOT/scripts/test-core.mjs"
