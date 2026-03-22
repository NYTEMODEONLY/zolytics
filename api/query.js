// zolytics — Query API Route (with auth)
// Runtime: Bun + Hono (Zo Space server-side)
// Route: /api/analytics/query  (route_type=api)
// GET /api/analytics/query?period=7d|30d|90d&limit=10&token=<auth_token>  → JSON analytics summary

const { Database } = require("bun:sqlite");
const fs = require("fs");

const DB_PATH = "/home/workspace/zolytics/analytics.db";
const TOKEN_PATH = "/home/workspace/zolytics/.auth_token";

let db: any = null;
let cachedToken: string | null = null;

function getAuthToken(): string | null {
  if (cachedToken) return cachedToken;
  try {
    cachedToken = fs.readFileSync(TOKEN_PATH, "utf-8").trim();
    return cachedToken;
  } catch {
    return null;
  }
}

function checkAuth(c: any): boolean {
  const token = getAuthToken();
  if (!token) return true; // no token file = no auth (first-run)
  
  // Check query param
  const qToken = c.req.query("token");
  if (qToken === token) return true;
  
  // Check cookie
  const cookie = c.req.header("cookie") || "";
  const match = cookie.match(/zolytics_token=([^;]+)/);
  if (match && match[1] === token) return true;
  
  return false;
}

function getDb(): any {
  if (!db) {
    try {
      db = new Database(DB_PATH, { readonly: true });
    } catch (e) {
      return null;
    }
  }
  return db;
}

function parsePeriod(period: string): number {
  switch (period) {
    case "7d": return 7;
    case "90d": return 90;
    default: return 30;
  }
}

const emptyResponse = (period: string) => ({
  period,
  total: 0,
  todayTotal: 0,
  daily: [],
  topPages: [],
  referrers: [],
  devices: [],
});

export default async function handler(c: any): Promise<Response> {
  if (c.req.method !== "GET") {
    return new Response(null, { status: 405 });
  }

  if (!checkAuth(c)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const period = c.req.query("period") || "30d";
  const days = parsePeriod(period);
  const limitRaw = parseInt(c.req.query("limit") || "10", 10);
  const limit = isNaN(limitRaw) || limitRaw < 1 ? 10 : Math.min(limitRaw, 50);

  const database = getDb();
  if (!database) {
    return new Response(JSON.stringify(emptyResponse(period)), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-cache" },
    });
  }

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const todayCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  try {
    const totalRow = database
      .prepare("SELECT COUNT(*) as count FROM page_views WHERE created_at >= ?")
      .get(cutoff) as { count: number };
    const total: number = totalRow?.count ?? 0;

    const todayRow = database
      .prepare("SELECT COUNT(*) as count FROM page_views WHERE created_at >= ?")
      .get(todayCutoff) as { count: number };
    const todayTotal: number = todayRow?.count ?? 0;

    const daily = database
      .prepare(
        `SELECT date(created_at) as date, COUNT(*) as count
         FROM page_views WHERE created_at >= ?
         GROUP BY date(created_at) ORDER BY date ASC`
      )
      .all(cutoff) as Array<{ date: string; count: number }>;

    const topPages = database
      .prepare(
        `SELECT path, COUNT(*) as count
         FROM page_views WHERE created_at >= ?
         GROUP BY path ORDER BY count DESC LIMIT ?`
      )
      .all(cutoff, limit) as Array<{ path: string; count: number }>;

    const referrers = database
      .prepare(
        `SELECT referrer, COUNT(*) as count
         FROM page_views
         WHERE created_at >= ? AND referrer IS NOT NULL AND referrer != 'direct'
         GROUP BY referrer ORDER BY count DESC LIMIT ?`
      )
      .all(cutoff, limit) as Array<{ referrer: string; count: number }>;

    const devices = database
      .prepare(
        `SELECT device_category as device, COUNT(*) as count
         FROM page_views
         WHERE created_at >= ? AND device_category IS NOT NULL
         GROUP BY device_category ORDER BY count DESC`
      )
      .all(cutoff) as Array<{ device: string; count: number }>;

    return new Response(
      JSON.stringify({ period, total, todayTotal, daily, topPages, referrers, devices }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
        },
      }
    );
  } catch (e) {
    console.error("[zolytics] Query error:", e);
    return new Response(JSON.stringify({ error: "query failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
