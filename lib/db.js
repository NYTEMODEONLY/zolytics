// zo-analytics — SQLite helper
// Uses Bun's built-in SQLite module (bun:sqlite)
// Note: Zo Space routes run on Bun, not Node.js — use bun:sqlite, not node:sqlite
'use strict';

const { Database } = require('bun:sqlite');

const DB_PATH = '/home/workspace/zo-analytics/analytics.db';

let db = null;

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

module.exports = { getDb };