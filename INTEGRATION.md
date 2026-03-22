# Zolytics — Integration Guide

How to add tracking to your Zo Space pages.

---

## Quick Snippet

Run the snippet generator for the exact code to add to your pages:

```bash
bash /home/workspace/zolytics/snippet.sh
# For HTML output:
bash /home/workspace/zolytics/snippet.sh --format html
# For inline (no external script):
bash /home/workspace/zolytics/snippet.sh --format inline
```

---

## Adding Tracking to a Zo Space JSX Page

Zo Space pages are React components. Add the tracker in a `useEffect`:

```jsx
import { useEffect } from 'react';

export default function MyPage() {
  useEffect(() => {
    const s = document.createElement('script');
    s.src = '/api/analytics/tracker.js';
    s.defer = true;
    document.head.appendChild(s);
    return () => {
      try { document.head.removeChild(s); } catch(e) {}
    };
  }, []);

  return <div>Your page content...</div>;
}
```

Or use an inline `<script>` tag in your JSX return (note: React uses `dangerouslySetInnerHTML` for inline scripts):

```jsx
export default function MyPage() {
  return (
    <>
      <script src="/api/analytics/tracker.js" defer />
      <div>Your page content...</div>
    </>
  );
}
```

---

## Adding Tracking to Multiple Pages

If you have many pages, create a shared analytics helper:

```jsx
// In each page's useEffect, call this once:
function trackPageView() {
  fetch('/api/analytics/collect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path: location.pathname + location.search,
      referrer: document.referrer || 'direct',
      viewport_width: window.innerWidth,
      timestamp: new Date().toISOString(),
    }),
    keepalive: true,
  }).catch(() => {});
}

// In your component:
useEffect(() => {
  trackPageView();
}, []);
```

---

## Tracking Custom Events (Optional)

The collection API only tracks page views by design. If you want to track custom events, POST to the same endpoint with a custom path:

```js
// Track a button click as a "virtual page view"
fetch('/api/analytics/collect', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    path: '/events/button-click',
    referrer: location.href,
    viewport_width: window.innerWidth,
    timestamp: new Date().toISOString(),
  }),
  keepalive: true,
}).catch(() => {});
```

These will appear as page views in the dashboard under the custom path you provide.

---

## Viewing the Dashboard

Once installed, visit:

```
https://[yourdomain].zo.space/analytics
```

The dashboard shows:
- Total page views for the selected period (7d, 30d, 90d)
- Views in the last 24 hours
- Daily view trend (bar chart)
- Top pages by view count
- Top referrers
- Device breakdown (mobile / tablet / desktop)

---

## Troubleshooting

### Dashboard shows "No data"

The collection API has data but the query API returned nothing — check:

1. Verify the query route is deployed:
   ```bash
   curl https://[yourdomain].zo.space/api/analytics/query?period=30d
   # Should return JSON, not a redirect
   ```

2. Check the SQLite DB has rows:
   ```bash
   sqlite3 /home/workspace/zolytics/analytics.db "SELECT COUNT(*) FROM page_views"
   ```

3. If empty, verify the collection API is deployed and your tracker snippet is in your pages.

### Getting 302 redirect on routes

Routes must be deployed with `public=true`. Re-deploy:

```bash
mcporter call zo.update_space_route \
  path=/api/analytics/collect \
  route_type=api \
  public=true \
  code="$(cat /home/workspace/zolytics/api/collect.js)"
```

### tracker.js returns 404

Deploy `tracker.js` as a Zo Space asset:

```bash
mcporter call zo.update_space_asset \
  source_file=/home/workspace/zolytics/tracker.js \
  asset_path=/api/analytics/tracker.js
```

Or serve it as part of a page route and reference it inline.

### Rate limit (429)

The collection API limits to 100 requests per IP per minute. This is to prevent abuse. If you're hitting this legitimately (load testing), wait 60 seconds.

### Database growing too large

The collection API auto-prunes data older than 90 days every 100 writes. To manually prune:

```bash
sqlite3 /home/workspace/zolytics/analytics.db \
  "DELETE FROM page_views WHERE created_at < datetime('now', '-90 days')"
```

To check database size:

```bash
ls -lh /home/workspace/zolytics/analytics.db
sqlite3 /home/workspace/zolytics/analytics.db "SELECT COUNT(*) FROM page_views"
```

### Re-running the installer

The installer is idempotent — safe to run multiple times. It will re-deploy all routes and preserve your existing database.

```bash
bash /home/workspace/zolytics/install.sh --yes
```

---

## Uninstalling

To remove zolytics from your Zo Space:

```bash
# Routes will be deleted (replace with your actual route IDs if needed)
mcporter call zo.delete_space_route path=/api/analytics/collect
mcporter call zo.delete_space_route path=/api/analytics/query
mcporter call zo.delete_space_route path=/analytics

# Optionally delete the database
rm /home/workspace/zolytics/analytics.db
```

---

*For questions or issues: https://github.com/NYTEMODEONLY/zolytics/issues*
