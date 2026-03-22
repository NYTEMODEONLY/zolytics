# zo-analytics

Open source, privacy-first web analytics for Zo Computers.

## Files

```
zo-analytics/
  tracker.js          # Browser tracking snippet (~485B gzipped)
  api/
    collect.js        # Zo Space API route source (deployed to /api/analytics/collect)
  lib/
    db.js             # SQLite helper (Node 22 native sqlite)
  lint.sh             # Syntax checker
  README.md           # This file
```

## Setup

1. **Deploy the API route** to Zo Space:
   ```bash
   python3 /home/workspace/paperclip-companies/zoey/scripts/deploy-zo-page.py \
     --api /api/analytics/collect \
     /home/workspace/zo-analytics/api/collect.js
   ```
   Or manually:
   ```bash
   mcporter call zo.update_space_route path=/api/analytics/collect route_type=api public=true code="$(cat api/collect.ts)"
   ```

2. **Add the tracker snippet** to any page:
   ```html
   <script src="https://nytemode.zo.space/zo-analytics/tracker.js" defer></script>
   ```
   Or with a custom endpoint:
   ```html
   <script src="/tracker.js" data-endpoint="/api/analytics/collect" defer></script>
   ```

## API

### POST /api/analytics/collect

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

## Database

SQLite at `/home/workspace/zo-analytics/analytics.db`

Schema: `page_views(id, timestamp, path, referrer, viewport_width, device_category, country, created_at)`

Data is auto-pruned after 90 days.

## Lint

```bash
bash lint.sh
```

## Test

```bash
curl -X POST https://nytemode.zo.space/api/analytics/collect \
  -H "Content-Type: application/json" \
  -d '{"path":"/test","referrer":"direct","viewport_width":1920,"timestamp":"2026-03-22T12:00:00Z"}'
# Expect: HTTP 204
```