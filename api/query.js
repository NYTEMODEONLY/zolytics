const { Database } = require('bun:sqlite');
const fs = require('fs');

const DB_PATH = '/home/workspace/zolytics/analytics.db';
const TOKEN_PATH = '/home/workspace/zolytics/.auth_token';

let db = null;
let cachedToken = null;

function getAuthToken() {
  if (cachedToken) return cachedToken;
  try {
    cachedToken = fs.readFileSync(TOKEN_PATH, 'utf8').trim();
    return cachedToken;
  } catch {
    return null;
  }
}

function checkAuth(c) {
  const token = getAuthToken();
  if (!token) return true;

  const queryToken = c.req.query('token');
  if (queryToken === token) return true;

  const cookie = c.req.header('cookie') || '';
  const match = cookie.match(/zolytics_token=([^;]+)/);
  if (match && match[1] === token) return true;

  return false;
}

function getDb() {
  if (!db) {
    try {
      db = new Database(DB_PATH, { readonly: true });
    } catch {
      return null;
    }
  }
  return db;
}

function parsePeriod(period) {
  switch (period) {
    case '7d':
      return 7;
    case '90d':
      return 90;
    default:
      return 30;
  }
}

function emptyResponse(period) {
  return {
    period,
    total: 0,
    todayTotal: 0,
    daily: [],
    topPages: [],
    referrers: [],
    devices: [],
  };
}

export default async function handler(c) {
  if (c.req.method !== 'GET') {
    return new Response(null, { status: 405 });
  }

  if (!checkAuth(c)) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const period = c.req.query('period') || '30d';
  const days = parsePeriod(period);
  const limitRaw = parseInt(c.req.query('limit') || '10', 10);
  const limit = Number.isNaN(limitRaw) || limitRaw < 1 ? 10 : Math.min(limitRaw, 50);

  const database = getDb();
  if (!database) {
    return new Response(JSON.stringify(emptyResponse(period)), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
    });
  }

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const todayCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  try {
    const totalRow = database
      .prepare('SELECT COUNT(*) as count FROM page_views WHERE created_at >= ?')
      .get(cutoff);
    const todayRow = database
      .prepare('SELECT COUNT(*) as count FROM page_views WHERE created_at >= ?')
      .get(todayCutoff);

    const daily = database
      .prepare(
        `SELECT date(created_at) as date, COUNT(*) as count
         FROM page_views WHERE created_at >= ?
         GROUP BY date(created_at) ORDER BY date ASC`
      )
      .all(cutoff);

    const topPages = database
      .prepare(
        `SELECT path, COUNT(*) as count
         FROM page_views WHERE created_at >= ?
         GROUP BY path ORDER BY count DESC LIMIT ?`
      )
      .all(cutoff, limit);

    const referrers = database
      .prepare(
        `SELECT
           CASE
             WHEN referrer IS NULL OR referrer = '' OR referrer = 'direct' THEN 'Direct'
             ELSE referrer
           END as referrer,
           COUNT(*) as count
         FROM page_views
         WHERE created_at >= ?
         GROUP BY referrer ORDER BY count DESC LIMIT ?`
      )
      .all(cutoff, limit);

    const devices = database
      .prepare(
        `SELECT device_category as device, COUNT(*) as count
         FROM page_views
         WHERE created_at >= ? AND device_category IS NOT NULL
         GROUP BY device_category ORDER BY count DESC`
      )
      .all(cutoff);

    return new Response(
      JSON.stringify({
        period,
        total: totalRow?.count ?? 0,
        todayTotal: todayRow?.count ?? 0,
        daily,
        topPages,
        referrers,
        devices,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  } catch (error) {
    console.error('[zolytics] Query error:', error);
    return new Response(JSON.stringify({ error: 'query failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
