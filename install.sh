#!/usr/bin/env bash
# zo-analytics install.sh
# One-command setup for Zo Analytics on any Zo Computer
# Usage: bash install.sh [--yes] [--analytics-path /analytics] [--db-path /path/to/analytics.db]
# Idempotent: safe to run multiple times

set -euo pipefail

# ─── Defaults ────────────────────────────────────────────────────────────────
ZO_ANALYTICS_DIR="${ZO_ANALYTICS_DIR:-/home/workspace/zo-analytics}"
DB_PATH="${DB_PATH:-/home/workspace/zo-analytics/analytics.db}"
ANALYTICS_ROUTE="${ANALYTICS_ROUTE:-/analytics}"
COLLECT_ROUTE="/api/analytics/collect"
QUERY_ROUTE="/api/analytics/query"
SKIP_CONFIRM=0

# ─── Arg parsing ─────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes|-y)          SKIP_CONFIRM=1 ;;
    --analytics-path)  ANALYTICS_ROUTE="$2"; shift ;;
    --db-path)         DB_PATH="$2"; shift ;;
    --dir)             ZO_ANALYTICS_DIR="$2"; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
  shift
done

# ─── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${BLUE}[zo-analytics]${RESET} $*"; }
success() { echo -e "${GREEN}[zo-analytics]${RESET} $*"; }
warn()    { echo -e "${YELLOW}[zo-analytics]${RESET} $*"; }
error()   { echo -e "${RED}[zo-analytics]${RESET} $*" >&2; }

# ─── Banner ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}  Zo Analytics — Privacy-First Web Analytics${RESET}"
echo -e "  Open source · No cookies · Self-hosted on your Zo Computer"
echo ""

# ─── Dependency check ────────────────────────────────────────────────────────
check_deps() {
  info "Checking dependencies..."

  if ! command -v mcporter &>/dev/null; then
    error "mcporter not found. Is this a Zo Computer?"
    error "mcporter must be installed at /usr/bin/mcporter."
    exit 1
  fi
  success "mcporter found at $(command -v mcporter)"

  if ! command -v node &>/dev/null; then
    error "Node.js not found. Zo Computers require Node.js 22."
    exit 1
  fi
  success "Node.js $(node --version)"
}

# ─── Confirm ─────────────────────────────────────────────────────────────────
confirm_deploy() {
  if [[ $SKIP_CONFIRM -eq 1 ]]; then return 0; fi
  echo ""
  echo "  This will deploy the following Zo Space routes:"
  echo "    POST ${COLLECT_ROUTE}   → collect page views"
  echo "    GET  ${QUERY_ROUTE}     → query analytics data"
  echo "    GET  ${ANALYTICS_ROUTE} → analytics dashboard"
  echo ""
  echo "  SQLite database: ${DB_PATH}"
  echo ""
  read -rp "  Proceed? [y/N] " ans
  case "$ans" in y|Y|yes|YES) return 0 ;; *)
    echo "  Cancelled."
    exit 0
  ;; esac
}

# ─── Deploy route helper ──────────────────────────────────────────────────────
deploy_route() {
  local route_path="$1"
  local route_type="$2"
  local source_file="$3"
  local label="$4"

  info "Deploying ${label} → ${route_path}..."

  if [[ ! -f "$source_file" ]]; then
    error "Source file not found: ${source_file}"
    error "Make sure you cloned/installed zo-analytics to: ${ZO_ANALYTICS_DIR}"
    exit 1
  fi

  local result
  result=$(mcporter call zo.update_space_route \
    "path=${route_path}" \
    "route_type=${route_type}" \
    "public=true" \
    "code=$(cat "$source_file")" 2>&1)

  if echo "$result" | grep -qi "error"; then
    error "Deploy failed for ${route_path}:"
    error "$result"
    exit 1
  fi
  success "${label} deployed → ${route_path}"
}

# ─── Create DB directory ──────────────────────────────────────────────────────
setup_db() {
  local db_dir
  db_dir="$(dirname "$DB_PATH")"
  info "Setting up SQLite storage at ${DB_PATH}..."
  mkdir -p "$db_dir"
  if [[ -f "$DB_PATH" ]]; then
    warn "Database already exists — skipping init (existing data preserved)"
  else
    success "Database directory ready: ${db_dir}"
  fi
}

# ─── Main ─────────────────────────────────────────────────────────────────────
main() {
  check_deps
  confirm_deploy

  echo ""
  info "Starting installation..."
  echo ""

  # 1. Setup DB directory
  setup_db

  # 2. Deploy collection API
  deploy_route "$COLLECT_ROUTE" "api" "${ZO_ANALYTICS_DIR}/api/collect.js" "Collection API"

  # 3. Deploy query API
  deploy_route "$QUERY_ROUTE" "api" "${ZO_ANALYTICS_DIR}/api/query.js" "Query API"

  # 4. Deploy dashboard page
  deploy_route "$ANALYTICS_ROUTE" "page" "${ZO_ANALYTICS_DIR}/dashboard/page-component.jsx" "Dashboard"

  echo ""
  echo -e "${GREEN}${BOLD}  Installation complete!${RESET}"
  echo ""
  echo "  ┌─────────────────────────────────────────────────────────────┐"
  echo "  │  Next step: add the tracking snippet to your pages           │"
  echo "  │                                                               │"
  echo "  │  Paste this into any Zo Space page JSX (inside useEffect):   │"
  echo "  │                                                               │"
  echo "  │    const s = document.createElement('script');               │"
  echo "  │    s.src = '/api/analytics/tracker.js';                       │"
  echo "  │    s.defer = true;                                            │"
  echo "  │    document.head.appendChild(s);                             │"
  echo "  │                                                               │"
  echo "  │  Or deploy tracker.js as an asset and use:                   │"
  echo "  │    <script src=\"/api/analytics/tracker.js\" defer></script>  │"
  echo "  │                                                               │"
  echo "  │  Dashboard: https://nytemode.zo.space${ANALYTICS_ROUTE}           │"
  echo "  └─────────────────────────────────────────────────────────────┘"
  echo ""
  echo "  For full integration guide: cat ${ZO_ANALYTICS_DIR}/INTEGRATION.md"
  echo ""
}

main
