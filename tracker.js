// zo-analytics tracker v1.0
// Privacy-first, async page view tracking. No cookies, no localStorage, no fingerprinting.
// Usage: <script src="/path/to/tracker.js" defer></script>
// Override endpoint: <script src="/tracker.js" data-endpoint="/api/custom/collect" defer></script>
(function () {
  var script = document.currentScript;
  var endpoint = (script && script.dataset && script.dataset.endpoint) || '/api/analytics/collect';
  try {
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: location.pathname + location.search,
        referrer: document.referrer || 'direct',
        viewport_width: window.innerWidth,
        timestamp: new Date().toISOString()
      }),
      keepalive: true
    }).catch(function () {});
  } catch (e) {}
})();