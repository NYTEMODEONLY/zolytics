const { Database } = require('bun:sqlite');

const DB_PATH = '/home/workspace/zolytics/analytics.db';
const RATE_LIMIT = 100;
const RATE_WINDOW_MS = 60 * 1000;

const rateLimiter = new Map();

let db = null;
let requestCount = 0;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.exec(`
      CREATE TABLE IF NOT EXISTS page_views (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        path TEXT NOT NULL,
        referrer TEXT,
        viewport_width INTEGER,
        device_category TEXT,
        country TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_pv_timestamp ON page_views(timestamp);
      CREATE INDEX IF NOT EXISTS idx_pv_path ON page_views(path);
    `);
  }
  return db;
}

function getDeviceCategory(width) {
  if (width < 768) return 'mobile';
  if (width <= 1024) return 'tablet';
  return 'desktop';
}

function checkRateLimit(ip) {
  const now = Date.now();
  let entry = rateLimiter.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_WINDOW_MS };
    rateLimiter.set(ip, entry);
  }
  entry.count += 1;
  return entry.count <= RATE_LIMIT;
}

export default async function handler(c) {
  if (c.req.method !== 'POST') {
    return new Response(null, { status: 405 });
  }

  const ip =
    c.req.header('cf-connecting-ip') ||
    (c.req.header('x-forwarded-for') || '').split(',')[0].trim() ||
    'unknown';

  if (!checkRateLimit(ip)) {
    return new Response(null, { status: 429 });
  }

  let body;
  try {
    const text = await c.req.text();
    if (text.length > 4096) {
      return new Response(null, { status: 400 });
    }
    body = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }

  const { path, referrer, viewport_width, timestamp } = body || {};

  if (!path || typeof path !== 'string' || path.length > 2048) {
    return new Response(null, { status: 400 });
  }
  if (!timestamp || typeof timestamp !== 'string' || timestamp.length > 64) {
    return new Response(null, { status: 400 });
  }
  if (
    viewport_width !== undefined &&
    viewport_width !== null &&
    typeof viewport_width !== 'number'
  ) {
    return new Response(null, { status: 400 });
  }

  const country = c.req.header('cf-ipcountry') || c.req.header('x-country') || null;
  const deviceCategory =
    typeof viewport_width === 'number' ? getDeviceCategory(viewport_width) : null;

  try {
    const database = getDb();
    database
      .prepare(
        'INSERT INTO page_views (timestamp, path, referrer, viewport_width, device_category, country) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(
        timestamp,
        path,
        typeof referrer === 'string' ? referrer : null,
        typeof viewport_width === 'number' ? viewport_width : null,
        deviceCategory,
        country
      );

    requestCount += 1;
    if (requestCount % 100 === 0) {
      database
        .prepare("DELETE FROM page_views WHERE created_at < datetime('now', '-90 days')")
        .run();
    }
  } catch (error) {
    console.error('[zolytics] DB error:', error);
    return new Response(null, { status: 500 });
  }

  return new Response(null, { status: 204 });
}
