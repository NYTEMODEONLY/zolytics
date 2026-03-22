// zolytics — Collection API Route
// Runtime: Bun + Hono (Zo Space server-side)
// Route: /api/analytics/collect  (route_type=api)
// POST { path, referrer, viewport_width, timestamp } → 204 | 400 | 429

const { Database } = require("bun:sqlite");

// In-memory rate limiter (resets on server restart — by design)
const rateLimiter: Map<string, { count: number; resetAt: number }> = new Map();
const RATE_LIMIT = 100;
const RATE_WINDOW_MS = 60 * 1000;

// SQLite singleton
let db: any = null;
let requestCount = 0;

function getDb(): any {
  if (!db) {
    db = new Database("/home/workspace/zolytics/analytics.db");
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

function getDeviceCategory(width: number): string {
  if (width < 768) return "mobile";
  if (width <= 1024) return "tablet";
  return "desktop";
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  let entry = rateLimiter.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_WINDOW_MS };
    rateLimiter.set(ip, entry);
  }
  entry.count++;
  return entry.count <= RATE_LIMIT;
}

export default async function handler(c: any): Promise<Response> {
  if (c.req.method !== "POST") {
    return new Response(null, { status: 405 });
  }

  // Rate limiting by IP
  const ip =
    c.req.header("cf-connecting-ip") ||
    (c.req.header("x-forwarded-for") || "").split(",")[0].trim() ||
    "unknown";

  if (!checkRateLimit(ip)) {
    return new Response(null, { status: 429 });
  }

  // Parse body — reject oversized payloads
  let body: any;
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

  // Validate required fields
  if (!path || typeof path !== "string" || path.length > 2048) {
    return new Response(null, { status: 400 });
  }
  if (!timestamp || typeof timestamp !== "string" || timestamp.length > 64) {
    return new Response(null, { status: 400 });
  }
  if (
    viewport_width !== undefined &&
    viewport_width !== null &&
    typeof viewport_width !== "number"
  ) {
    return new Response(null, { status: 400 });
  }

  // Derive extra fields
  const country = c.req.header("cf-ipcountry") || c.req.header("x-country") || null;
  const deviceCategory =
    typeof viewport_width === "number" ? getDeviceCategory(viewport_width) : null;

  // Write to SQLite
  try {
    const database = getDb();
    database
      .prepare(
        "INSERT INTO page_views (timestamp, path, referrer, viewport_width, device_category, country) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(
        timestamp,
        path,
        typeof referrer === "string" ? referrer : null,
        typeof viewport_width === "number" ? viewport_width : null,
        deviceCategory,
        country
      );

    // Auto-prune every 100th write — remove rows older than 90 days
    requestCount++;
    if (requestCount % 100 === 0) {
      database
        .prepare("DELETE FROM page_views WHERE created_at < datetime('now', '-90 days')")
        .run();
    }
  } catch (e) {
    console.error("[zolytics] DB error:", e);
    return new Response(null, { status: 500 });
  }

  return new Response(null, { status: 204 });
}