# zolytics

**Open source, privacy-first web analytics for Zo Computers.**

Track page views on your Zo Space without cookies, fingerprinting, or external services. Everything runs on your own Zo Computer — data never leaves your machine.

---

## Features

- **Zero cookies** — GDPR/CCPA compliant by design
- **No fingerprinting** — captures only path, referrer, viewport, and timestamp
- **Self-hosted** — SQLite database on your Zo Computer, no third parties
- **No Zo Service slot** — uses Zo Space routes only
- **Auto-pruning** — data older than 90 days is removed automatically
- **Dashboard** — dark-themed, mobile-responsive analytics UI at `/analytics`
- **Lightweight** — tracker.js is ~485 bytes gzipped

---

## Quick Start

```bash
# 1. Clone
git clone https://github.com/NYTEMODEONLY/zolytics /home/workspace/zolytics

# 2. Install (deploys routes, injects tracker site-wide, sets up auto-sync)
bash /home/workspace/zolytics/install.sh

# 3. Save the auth token printed at the end of install!
```

Your dashboard will be live at `https://[yourdomain].zo.space/analytics`.

Installation automatically:
- Deploys the collection API, query API, and analytics dashboard
- Injects the tracker into **all existing** Zo Space pages
- Creates a Zo agent that re-runs tracker sync every 30 minutes (auto-tracks new pages)

---

## Authentication

Zolytics protects the query API and dashboard with an auth token. The **collection endpoint** (`/api/analytics/collect`) remains unauthenticated so it can receive anonymous page view hits from visitors.

### Token generation

During installation, a 32-character hex token is generated automatically and saved to `/home/workspace/zolytics/.auth_token`. The token is displayed at the end of installation — **save it**.

### Custom token

To set your own token instead of the auto-generated one:

```bash
bash install.sh --token mysecretpassword
```

### Finding your token

```bash
cat /home/workspace/zolytics/.auth_token
```

### Rotating your token

Generate a new random token at any time:

```bash
openssl rand -hex 16 > /home/workspace/zolytics/.auth_token
```

The query API reads the token file on every request, so rotation takes effect immediately — no restart needed. You will need to log in again on the dashboard with the new token.

---

## Auto-Tracking (Site-Wide)

Zolytics automatically tracks every page on your Zo Space site — no manual snippet injection needed.

**How it works:**

1. `install.sh` runs `sync-tracker.py` which injects the tracker into all existing page routes
2. A Zo agent runs `sync-tracker.py` every 30 minutes to catch any new pages

**Manual sync** (if needed):

```bash
# Check all pages and inject where missing
python3 /home/workspace/zolytics/sync-tracker.py

# Dry run — see what would change
python3 /home/workspace/zolytics/sync-tracker.py --dry-run

# Sync a specific route
python3 /home/workspace/zolytics/sync-tracker.py --route /my-page

# Re-create the cron agent (if deleted)
python3 /home/workspace/zolytics/sync-tracker.py --setup-cron
```

The tracker is injected via `zo.update_space_route` `code_edit`, which preserves existing page changes.

---

## Repository Structure

```
zolytics/
  tracker.js                    # Browser tracking snippet (~485B gzipped)
  install.sh                    # One-command installer (deploys + auto-injects)
  sync-tracker.py               # Site-wide tracker sync (auto-injects all pages)
  snippet.sh                    # Tracking snippet generator (manual use)
  lint.sh                       # Syntax / style checker
  README.md                     # This file
  INTEGRATION.md                # Integration guide
  api/
    collect.js                  # Zo Space API route: POST /api/analytics/collect
    query.js                    # Zo Space API route: GET /api/analytics/query
  dashboard/
    page-component.jsx          # Zo Space page: GET /analytics
  lib/
    db.js                       # SQLite helper (shared schema)
```

---

## Manual Setup

If you prefer to set up step-by-step:

### 1. Deploy the collection API

```bash
mcporter call zo.update_space_route \
  path=/api/analytics/collect \
  route_type=api \
  public=true \
  code="$(cat /home/workspace/zolytics/api/collect.js)"
```

### 2. Deploy the query API

```bash
mcporter call zo.update_space_route \
  path=/api/analytics/query \
  route_type=api \
  public=true \
  code="$(cat /home/workspace/zolytics/api/query.js)"
```

### 3. Deploy the dashboard page

```bash
python3 /home/workspace/paperclip-companies/zoey/scripts/deploy-zo-page.py \
  /analytics \
  /home/workspace/zolytics/dashboard/page-component.jsx
```

### 4. Add the tracking snippet

See [INTEGRATION.md](./INTEGRATION.md) for how to add tracking to your pages.

---

## Configuration

| Variable | Default | Description |
|---|---|---|
| `ZOLYTICS_DIR` | `/home/workspace/zolytics` | Path to zolytics checkout |
| `DB_PATH` | `/home/workspace/zolytics/analytics.db` | SQLite database path |
| `ANALYTICS_ROUTE` | `/analytics` | Dashboard URL path |

Pass as env vars or flags to `install.sh`:

```bash
ZOLYTICS_DIR=/my/path bash install.sh --analytics-path /my-analytics --yes
```

**Retention period:** The collection API auto-prunes data older than 90 days every 100 writes. There is no config option for this currently — edit the `100` and `90` constants in `api/collect.js` if needed.

---

## API Reference

### POST /api/analytics/collect

Records a page view.

**Request body:**
```json
{
  "path": "/about",
  "referrer": "https://google.com",
  "viewport_width": 1440,
  "timestamp": "2026-03-22T12:00:00Z"
}
```

**Responses:**
- `204` — recorded successfully
- `400` — invalid or missing fields
- `429` — rate limit exceeded (100 req/IP/min)

### GET /api/analytics/query

Returns analytics summary for a time period. **Requires authentication.**

**Query params:**
- `token` — **required** — your auth token from `.auth_token`
- `period` — `7d`, `30d` (default), or `90d`
- `limit` — max items per list (default 10, max 50)

**Auth errors:**
- `401` — missing, invalid, or no token configured

**Response:**
```json
{
  "period": "30d",
  "total": 1423,
  "todayTotal": 47,
  "daily": [{ "date": "2026-03-01", "count": 38 }, ...],
  "topPages": [{ "path": "/zoey", "count": 612 }, ...],
  "referrers": [{ "referrer": "https://twitter.com", "count": 89 }, ...],
  "devices": [{ "device": "mobile", "count": 834 }, ...]
}
```

---

## Database

**Location:** `/home/workspace/zolytics/analytics.db`

**Schema:**
```sql
CREATE TABLE page_views (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp       TEXT NOT NULL,        -- ISO 8601 from client
  path            TEXT NOT NULL,        -- URL path + query string
  referrer        TEXT,                 -- referrer URL or "direct"
  viewport_width  INTEGER,              -- browser width in px
  device_category TEXT,                 -- "mobile" | "tablet" | "desktop"
  country         TEXT,                 -- from CF-IPCountry header (if available)
  created_at      TEXT DEFAULT (datetime('now'))
);
```

**Backup:**
```bash
cp /home/workspace/zolytics/analytics.db ~/analytics-backup-$(date +%Y%m%d).db
```

---

## Privacy

**What is tracked:**
- Page path and query string
- HTTP referrer
- Viewport width (used to classify device type: mobile/tablet/desktop)
- Client-supplied timestamp
- Country code from Cloudflare headers (when available — not always present)

**What is NOT tracked:**
- IP addresses (not stored)
- Cookies or localStorage
- User agent string
- Fingerprinting data
- Any personally identifiable information

**GDPR/CCPA:** No consent banner required. No personal data is collected or stored.

---

## Architecture

```
Browser
  │
  │  POST /api/analytics/collect
  ▼
Zo Space API Route (collect.js)
  │  rate limit (100 req/IP/min)
  │  validate fields
  ▼
SQLite (analytics.db)         ◄── auto-prune every 100 writes
  │
  │  GET /api/analytics/query
  ▼
Zo Space API Route (query.js)
  │  readonly connection
  │  returns JSON summary
  ▼
Dashboard Page (/analytics)
  │  React JSX, self-contained
  │  fetches /api/analytics/query
  └── dark theme, mobile-first, no CDN
```

---

## Lint

```bash
bash /home/workspace/zolytics/lint.sh
```

---

## Test the collection API

```bash
curl -X POST https://[yourdomain].zo.space/api/analytics/collect \
  -H "Content-Type: application/json" \
  -d '{"path":"/test","referrer":"direct","viewport_width":1440,"timestamp":"2026-03-22T12:00:00Z"}'
# Expect: HTTP 204
```

---

## Contributing

1. Fork the repo
2. Make your change
3. Run `bash lint.sh`
4. Open a PR with a clear description

Please keep the tracker under 1KB gzipped and maintain zero production dependencies.

---

## License

MIT © NYTEMODE

---

*Built for the Zo Computer community. Self-host everything.*
