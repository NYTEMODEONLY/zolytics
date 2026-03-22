#!/usr/bin/env bash
# zolytics install.sh
# One-command setup for Zolytics on any Zo Computer
# Usage: bash install.sh [--yes] [--analytics-path /analytics] [--db-path /path/to/analytics.db]
# Idempotent: safe to run multiple times

set -euo pipefail

# ─── Defaults ────────────────────────────────────────────────────────────────
ZOLYTICS_DIR="${ZOLYTICS_DIR:-/home/workspace/zolytics}"
DB_PATH="${DB_PATH:-/home/workspace/zolytics/analytics.db}"
ANALYTICS_ROUTE="${ANALYTICS_ROUTE:-/analytics}"
COLLECT_ROUTE="/api/analytics/collect"
QUERY_ROUTE="/api/analytics/query"
SKIP_CONFIRM=0
CUSTOM_TOKEN=""

# ─── Arg parsing ─────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes|-y)          SKIP_CONFIRM=1 ;;
    --analytics-path)  ANALYTICS_ROUTE="$2"; shift ;;
    --db-path)         DB_PATH="$2"; shift ;;
    --dir)             ZOLYTICS_DIR="$2"; shift ;;
    --token)           CUSTOM_TOKEN="$2"; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
  shift
done

# ─── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${BLUE}[zolytics]${RESET} $*"; }
success() { echo -e "${GREEN}[zolytics]${RESET} $*"; }
warn()    { echo -e "${YELLOW}[zolytics]${RESET} $*"; }
error()   { echo -e "${RED}[zolytics]${RESET} $*" >&2; }

# ─── Banner ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}  Zolytics — Privacy-First Web Analytics${RESET}"
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
    error "Make sure you cloned/installed zolytics to: ${ZOLYTICS_DIR}"
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

  # 1b. Generate or set auth token
  local token_file="${ZOLYTICS_DIR}/.auth_token"
  if [[ -n "$CUSTOM_TOKEN" ]]; then
    echo -n "$CUSTOM_TOKEN" > "$token_file"
    chmod 600 "$token_file"
    info "Using custom auth token"
  elif [[ ! -f "$token_file" ]]; then
    local generated_token
    generated_token=$(openssl rand -hex 16)
    echo -n "$generated_token" > "$token_file"
    chmod 600 "$token_file"
    info "Generated new auth token"
  else
    info "Auth token already exists — keeping existing token"
  fi

  # 2. Deploy collection API
  deploy_route "$COLLECT_ROUTE" "api" "${ZOLYTICS_DIR}/api/collect.js" "Collection API"

  # 3. Deploy query API
  deploy_route "$QUERY_ROUTE" "api" "${ZOLYTICS_DIR}/api/query.js" "Query API"

  # 4. Deploy dashboard page
  deploy_route "$ANALYTICS_ROUTE" "page" "${ZOLYTICS_DIR}/dashboard/page-component.jsx" "Dashboard"

  echo ""
  echo -e "${GREEN}${BOLD}  Installation complete!${RESET}"
  echo ""
  local saved_token
  saved_token=$(cat "$token_file")
  echo "  ┌─────────────────────────────────────────────────────────────┐"
  echo "  │  ${BOLD}YOUR AUTH TOKEN:${RESET} ${YELLOW}${saved_token}${RESET}"
  echo "  │                                                               │"
  echo "  │  Save this token! You need it to access the dashboard and    │"
  echo "  │  the query API. It is stored in:                             │"
  echo "  │    ${ZOLYTICS_DIR}/.auth_token                               │"
  echo "  │                                                               │"
  echo "  │  To rotate your token:                                       │"
  echo "  │    openssl rand -hex 16 > ${ZOLYTICS_DIR}/.auth_token        │"
  echo "  │                                                               │"
  echo "  │  To set a custom token:                                      │"
  echo "  │    bash install.sh --token <your-password>                   │"
  echo "  │                                                               │"
  echo "  │  Dashboard: https://nytemode.zo.space${ANALYTICS_ROUTE}           │"
  echo "  └─────────────────────────────────────────────────────────────┘"
  echo ""
  echo ""
  info "Injecting Zolytics tracker into all existing Zo Space pages..."
  python3 "${ZOLYTICS_DIR}/sync-tracker.py" || true

  echo ""
  info "Setting up periodic sync agent (runs every 30 min via Zo agent)..."
  python3 "${ZOLYTICS_DIR}/sync-tracker.py" --setup-cron || true

  echo ""
  echo "  Next: new pages will be auto-tracked within 30 minutes of creation."
  echo "  Run sync manually: python3 ${ZOLYTICS_DIR}/sync-tracker.py"
  echo "  For full guide: cat ${ZOLYTICS_DIR}/INTEGRATION.md"
  echo ""
}

main
