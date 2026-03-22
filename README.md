# zo-analytics

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
git clone https://github.com/NYTEMODEONLY/zo-analytics /home/workspace/zo-analytics

# 2. Install (deploys routes to your Zo Space)
bash /home/workspace/zo-analytics/install.sh

# 3. Add the tracker to your pages (see snippet.sh below)
bash /home/workspace/zo-analytics/snippet.sh
```

Your dashboard will be live at `https://[yourdomain].zo.space/analytics`.

---

## Repository Structure

```
zo-analytics/
  tracker.js                    # Browser tracking snippet (~485B gzipped)
  install.sh                    # One-command installer
  snippet.sh                    # Tracking snippet generator
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
  code="$(cat /home/workspace/zo-analytics/api/collect.js)"
```

### 2. Deploy the query API

```bash
mcporter call zo.update_space_route \
  path=/api/analytics/query \
  route_type=api \
  public=true \
  code="$(cat /home/workspace/zo-analytics/api/query.js)"
```

### 3. Deploy the dashboard page

```bash
python3 /home/workspace/paperclip-companies/zoey/scripts/deploy-zo-page.py \
  /analytics \
  /home/workspace/zo-analytics/dashboard/page-component.jsx
```

### 4. Add the tracking snippet

See [INTEGRATION.md](./INTEGRATION.md) for how to add tracking to your pages.

---

## Configuration

| Variable | Default | Description |
|---|---|---|
| `ZO_ANALYTICS_DIR` | `/home/workspace/zo-analytics` | Path to zo-analytics checkout |
| `DB_PATH` | `/home/workspace/zo-analytics/analytics.db` | SQLite database path |
| `ANALYTICS_ROUTE` | `/analytics` | Dashboard URL path |

Pass as env vars or flags to `install.sh`:

```bash
ZO_ANALYTICS_DIR=/my/path bash install.sh --analytics-path /my-analytics --yes
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

Returns analytics summary for a time period.

**Query params:**
- `period` — `7d`, `30d` (default), or `90d`
- `limit` — max items per list (default 10, max 50)

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

**Location:** `/home/workspace/zo-analytics/analytics.db`

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
cp /home/workspace/zo-analytics/analytics.db ~/analytics-backup-$(date +%Y%m%d).db
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
bash /home/workspace/zo-analytics/lint.sh
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
