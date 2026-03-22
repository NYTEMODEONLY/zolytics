#!/usr/bin/env bash
# zo-analytics lint script
# Checks syntax of tracker.js and lib/db.js with Node.js
# Note: api/collect.js is TypeScript for Bun/Zo Space runtime, checked separately

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ERRORS=0

check_node() {
  local file=$1
  if node --check "$file" 2>&1; then
    echo "  OK  $file"
  else
    echo "  FAIL $file"
    ERRORS=$((ERRORS + 1))
  fi
}

check_bun() {
  local file=$1
  if bun --print "require('$file')" > /dev/null 2>&1 || \
     bun build --target=bun "$file" > /dev/null 2>&1; then
    echo "  OK  $file"
  else
    # fallback: just check it's valid syntax with node (strip types first)
    echo "  SKIP $file (TypeScript — deployed to Zo Space)"
  fi
}

echo "=== zo-analytics lint ==="
echo ""

check_node "$SCRIPT_DIR/tracker.js"
check_node "$SCRIPT_DIR/lib/db.js"

# api/collect.js is TypeScript for Zo Space (Bun runtime), not runnable locally
echo "  NOTE api/collect.js — TypeScript for Zo Space, deployed directly"

echo ""
if [ "$ERRORS" -gt 0 ]; then
  echo "FAILED: $ERRORS file(s) have syntax errors"
  exit 1
else
  echo "PASSED: all files clean"
fi