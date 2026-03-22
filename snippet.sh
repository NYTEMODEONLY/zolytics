#!/usr/bin/env bash
# zo-analytics snippet.sh
# Generates the tracking snippet for your Zo Space pages.
# Usage: bash snippet.sh [--domain yourdomain.zo.space] [--format jsx|html|inline]

set -euo pipefail

DOMAIN=""
FORMAT="jsx"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift ;;
    --format) FORMAT="$2"; shift ;;
    -h|--help)
      echo "Usage: bash snippet.sh [--domain domain.zo.space] [--format jsx|html|inline]"
      exit 0 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
  shift
done

# Auto-detect domain from mcporter if not provided
if [[ -z "$DOMAIN" ]]; then
  if command -v mcporter &>/dev/null; then
    RAW=$(mcporter call zo.get_user_info 2>/dev/null || true)
    # Try to extract subdomain from output
    DETECTED=$(echo "$RAW" | grep -oP '[a-z0-9-]+\.zo\.space' | head -1 || true)
    if [[ -n "$DETECTED" ]]; then
      DOMAIN="$DETECTED"
    fi
  fi
fi

# Final fallback
if [[ -z "$DOMAIN" ]]; then
  DOMAIN="nytemode.zo.space"
fi

BASE_URL="https://${DOMAIN}"
TRACKER_URL="${BASE_URL}/api/analytics/tracker.js"
COLLECT_ENDPOINT="/api/analytics/collect"

case "$FORMAT" in
  html)
    echo ""
    echo "<!-- Zo Analytics tracking snippet -->"
    echo "<script src=\"${TRACKER_URL}\" defer></script>"
    echo ""
    ;;
  inline)
    echo ""
    echo "<!-- Zo Analytics — inline tracking (no external script) -->"
    cat << SNIPPET
<script>
(function(){
  try {
    fetch('${COLLECT_ENDPOINT}', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: location.pathname + location.search,
        referrer: document.referrer || 'direct',
        viewport_width: window.innerWidth,
        timestamp: new Date().toISOString()
      }),
      keepalive: true
    }).catch(function(){});
  } catch(e) {}
})();
</script>
SNIPPET
    echo ""
    ;;
  jsx|*)
    echo ""
    echo "// Zo Analytics — add to useEffect in your Zo Space JSX page"
    echo ""
    echo "useEffect(() => {"
    echo "  const s = document.createElement('script');"
    echo "  s.src = '${TRACKER_URL}';"
    echo "  s.defer = true;"
    echo "  document.head.appendChild(s);"
    echo "  return () => { try { document.head.removeChild(s); } catch(e) {} };"
    echo "}, []);"
    echo ""
    echo "// Or as a JSX script tag (add inside your component return):"
    echo "// <script src=\"${TRACKER_URL}\" defer />"
    echo ""
    ;;
esac

echo "Dashboard: ${BASE_URL}/analytics"
echo ""
